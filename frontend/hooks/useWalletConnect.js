'use client'
import { useState, useCallback, useEffect } from 'react'
import { useAccount, useConnect, useDisconnect, useSignMessage } from 'wagmi'
import { useAuth, useUser } from '@clerk/nextjs'
import { createApiClient } from '@/lib/api'
import { WALLET_SIGN_MESSAGE } from '@/lib/wallet'

/**
 * One-call wallet connect flow:
 *   1. wagmi connect (injected — MetaMask, etc.)
 *   2. EIP-191 sign of "Connect wallet to OutcomeX {clerkUserId}"
 *   3. POST /api/users/me/wallet with the address + signature
 *
 * The backend stores the wallet on the User row so fund-escrow can verify
 * msg.sender against it.
 */
export function useWalletConnect() {
  const { address, isConnected, status } = useAccount()
  const { connectAsync, connectors, isPending: isConnecting } = useConnect()
  const { disconnect } = useDisconnect()
  const { signMessageAsync } = useSignMessage()
  const { getToken, isLoaded, isSignedIn } = useAuth()
  const { user } = useUser()

  // Mirror wagmi's connected state to the Clerk session. wagmi's shimDisconnect
  // persists the connection in localStorage, so without this effect a user who
  // signs out (or whose session simply expires) sees their address still
  // "connected" on the next page load — and the next person to sign in on the
  // same browser sees the previous user's wallet. Disconnect on signed-out.
  useEffect(() => {
    if (isLoaded && !isSignedIn && isConnected) {
      disconnect()
    }
  }, [isLoaded, isSignedIn, isConnected, disconnect])

  const [busy, setBusy]   = useState(false)
  const [error, setError] = useState(null)
  const [linked, setLinked] = useState(false)

  const connectAndLink = useCallback(async () => {
    setError(null)
    if (!isSignedIn) {
      setError('Sign in first to link a wallet.')
      return
    }
    setBusy(true)
    try {
      let walletAddress = address
      if (!isConnected) {
        const injectedConnector = connectors.find(c => c.id === 'injected') || connectors[0]
        if (!injectedConnector) throw new Error('No wallet detected. Install MetaMask or a compatible wallet.')
        const res = await connectAsync({ connector: injectedConnector })
        walletAddress = res.accounts?.[0]
      }
      if (!walletAddress) throw new Error('Wallet did not return an address.')

      const message = WALLET_SIGN_MESSAGE(user.id)
      const signature = await signMessageAsync({ message })

      const api = createApiClient(getToken)
      await api.connectWallet(walletAddress, signature)
      setLinked(true)
    } catch (e) {
      setError(e?.shortMessage || e?.message || 'Wallet connect failed')
    } finally {
      setBusy(false)
    }
  }, [isSignedIn, isConnected, address, connectors, connectAsync, signMessageAsync, getToken, user])

  return {
    address,
    isConnected,
    isConnecting: isConnecting || busy,
    status,
    error,
    linked,
    connectAndLink,
    disconnect,
  }
}
