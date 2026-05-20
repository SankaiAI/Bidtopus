'use client'
import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAccount, useConnect, useSwitchChain, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi'
import { keccak256, toBytes, parseUnits, maxUint256, UserRejectedRequestError, SwitchChainError } from 'viem'
import { useAuth } from '@clerk/nextjs'
import { createApiClient } from '@/lib/api'
import { ESCROW_ABI, ERC20_ABI } from '@/lib/escrowAbi'
import { ESCROW_ADDRESS, USDC_ADDRESS, AGENT_ADDRESS, arcTestnet } from '@/lib/wallet'

// Friendly messages keyed by the phase the failure happened in. We attach the
// phase to a sentinel error so the catch can decide which message to show.
function explainError(err, phase) {
  const isReject =
    err instanceof UserRejectedRequestError ||
    err?.code === 4001 ||
    err?.cause?.code === 4001 ||
    /user (rejected|denied)/i.test(err?.message || '') ||
    /user (rejected|denied)/i.test(err?.shortMessage || '')
  const isSwitch =
    err instanceof SwitchChainError ||
    err?.name === 'SwitchChainError' ||
    err?.name === 'ChainNotConfiguredError'
  const isRpc =
    /(network|rpc|fetch failed|timeout|getaddrinfo|ECONNREFUSED)/i.test(err?.message || '')

  if (phase === 'switching') {
    if (isReject) return 'You declined to switch the wallet to Arc testnet. Approve the network switch in your wallet and try again.'
    if (isSwitch) return 'Could not switch your wallet to Arc testnet. Open MetaMask, add the Arc network manually, and retry.'
    if (isRpc)    return 'Could not reach the Arc network. Check your internet connection and the Arc RPC, then retry.'
  }
  if (phase === 'approving') {
    if (isReject) return 'You declined the USDC approval in your wallet. Confirm the approve() transaction to allow the escrow contract to pull USDC.'
    if (isRpc)    return 'Network error while submitting the USDC approve transaction. Retry in a moment.'
  }
  if (phase === 'funding') {
    if (isReject) return 'You declined the fund-escrow transaction in your wallet. Confirm the fund() call to lock USDC on Arc.'
    if (isRpc)    return 'Network error while submitting the fund transaction. Retry in a moment.'
  }
  if (phase === 'verifying') {
    return err?.message?.includes('400') || err?.message?.includes('not in')
      ? 'The backend rejected this funding attempt. The contract may not be in the FundedPending state — reload and try again.'
      : (err?.message || 'The backend rejected the fund-escrow confirmation. Reload and retry.')
  }
  if (phase === 'connecting') {
    if (isReject) return 'You closed the wallet connection prompt. Click again and approve the connection to continue.'
    return 'Could not connect a wallet. Install MetaMask or a compatible wallet and retry.'
  }
  return err?.shortMessage || err?.message || 'Transaction failed'
}

/**
 * The "Lock USDC in Escrow" button.
 *
 * Approval gate: button is hard-disabled until `termsLoaded === true`.
 * Flow:
 *   1. Ensure wallet connected and on Arc testnet
 *   2. usdc.approve(escrow, amount)  (skipped if allowance already sufficient)
 *   3. escrow.fund(contractId, amount, merchant, agent)
 *   4. POST /api/contracts/:id/fund-escrow with the receipt
 */
export default function EscrowFundButton({
  contractId,
  feeUsdc,
  termsLoaded,
  onFunded,
}) {
  const router = useRouter()
  const { address, isConnected, chainId } = useAccount()
  const { connectors, connectAsync } = useConnect()
  const { switchChainAsync } = useSwitchChain()
  const { writeContractAsync } = useWriteContract()
  const { getToken } = useAuth()

  const [phase, setPhase] = useState('idle')
  const [error, setError] = useState(null)
  const [approveTxHash, setApproveTxHash] = useState(null)
  const [fundTxHash, setFundTxHash] = useState(null)

  const amountBaseUnits = parseUnits(String(feeUsdc), 6)
  const chainContractId = keccak256(toBytes(String(contractId)))

  const allowanceQuery = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address && ESCROW_ADDRESS ? [address, ESCROW_ADDRESS] : undefined,
    chainId: arcTestnet.id,
    query: { enabled: !!address },
  })

  const approveWait = useWaitForTransactionReceipt({ hash: approveTxHash, chainId: arcTestnet.id })
  const fundWait    = useWaitForTransactionReceipt({ hash: fundTxHash,    chainId: arcTestnet.id })

  const disabled = !termsLoaded || phase === 'submitting' || phase === 'verifying'

  const submit = useCallback(async () => {
    setError(null)
    let currentPhase = 'submitting'
    setPhase(currentPhase)
    try {
      if (!ESCROW_ADDRESS || !USDC_ADDRESS || !AGENT_ADDRESS) {
        throw new Error('Escrow/USDC/agent address missing from env')
      }

      if (!isConnected) {
        currentPhase = 'connecting'
        setPhase(currentPhase)
        const injected = connectors.find(c => c.id === 'injected') || connectors[0]
        if (!injected) throw new Error('No wallet detected. Install MetaMask or compatible wallet.')
        await connectAsync({ connector: injected })
      }

      if (chainId !== arcTestnet.id) {
        currentPhase = 'switching'
        setPhase(currentPhase)
        await switchChainAsync({ chainId: arcTestnet.id })
      }

      const allowance = allowanceQuery.data ?? 0n
      if (allowance < amountBaseUnits) {
        currentPhase = 'approving'
        setPhase(currentPhase)
        const hash = await writeContractAsync({
          address: USDC_ADDRESS,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [ESCROW_ADDRESS, maxUint256],
          chainId: arcTestnet.id,
        })
        setApproveTxHash(hash)
      }

      currentPhase = 'funding'
      setPhase(currentPhase)
      const txHash = await writeContractAsync({
        address: ESCROW_ADDRESS,
        abi: ESCROW_ABI,
        functionName: 'fund',
        args: [chainContractId, amountBaseUnits, address, AGENT_ADDRESS],
        chainId: arcTestnet.id,
      })
      setFundTxHash(txHash)
    } catch (e) {
      setError(explainError(e, currentPhase))
      setPhase('idle')
    }
  }, [isConnected, chainId, connectors, connectAsync, switchChainAsync, writeContractAsync, allowanceQuery.data, amountBaseUnits, address, chainContractId])

  useEffect(() => {
    if (!fundTxHash || fundWait.isLoading) return
    if (fundWait.isError) {
      setError(explainError(fundWait.error, 'funding') || 'Fund transaction failed on-chain')
      setPhase('idle')
      return
    }
    if (!fundWait.data) return

    let cancelled = false
    setPhase('verifying')
    ;(async () => {
      try {
        const api = createApiClient(getToken)
        await api.fundEscrow(contractId, fundTxHash, chainContractId, Number(feeUsdc))
        if (cancelled) return
        setPhase('done')
        if (onFunded) onFunded({ txHash: fundTxHash, chainContractId })
        else router.push(`/workspace/${contractId}`)
      } catch (e) {
        if (cancelled) return
        setError(explainError(e, 'verifying'))
        setPhase('idle')
      }
    })()
    return () => { cancelled = true }
  }, [fundTxHash, fundWait.isLoading, fundWait.isError, fundWait.data, fundWait.error, getToken, contractId, chainContractId, feeUsdc, onFunded, router])

  const label = ({
    idle:       `Lock ${Number(feeUsdc).toFixed(2)} USDC in Arc Escrow`,
    submitting: 'Preparing transaction…',
    connecting: 'Connecting wallet…',
    switching:  'Switching to Arc testnet…',
    approving:  'Waiting for USDC approval…',
    funding:    'Confirm fund transaction in wallet…',
    verifying:  'Confirming on Arc & notifying backend…',
    done:       'Funded — moving to strategy approval',
  })[phase] || 'Lock USDC in Arc Escrow'

  return (
    <div>
      <button
        onClick={submit}
        disabled={disabled}
        title={!termsLoaded ? 'Loading contract terms…' : ''}
        style={{
          width: '100%', padding: '13px', borderRadius: '9px', border: 'none',
          background: disabled ? 'var(--c-faint)' : 'var(--c-indigo)',
          color: '#fff', fontSize: '14px', fontWeight: 700,
          cursor: disabled ? 'not-allowed' : 'pointer',
          fontFamily: 'Plus Jakarta Sans, sans-serif',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          transition: 'opacity 0.15s',
        }}
        onMouseEnter={e => { if (!disabled) e.currentTarget.style.opacity = '0.88' }}
        onMouseLeave={e => { if (!disabled) e.currentTarget.style.opacity = '1' }}
      >
        {label}
        {phase === 'idle' && (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M5 12h14M12 5l7 7-7 7"/>
          </svg>
        )}
      </button>
      {error && (
        <p style={{ marginTop: '10px', padding: '8px 12px', borderRadius: '8px', background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: '12px', fontFamily: 'Plus Jakarta Sans, sans-serif', lineHeight: 1.5 }}>
          {error}
        </p>
      )}
      <p style={{ fontSize: '11px', color: 'var(--c-faint)', textAlign: 'center', margin: '10px 0 0', fontFamily: 'Plus Jakarta Sans, sans-serif', lineHeight: 1.6 }}>
        Settlement is enforced by a smart contract on Arc — not by OutcomeX. Neither party can override it.
      </p>
    </div>
  )
}
