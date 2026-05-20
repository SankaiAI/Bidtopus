/**
 * Wallet kit — Circle App Kit integration via wagmi/viem.
 *
 * Circle App Kit is positioned as a wagmi-compatible connector layer (similar
 * to RainbowKit). Here we configure wagmi directly so MetaMask and any other
 * injected wallet works without forcing users into a Circle-hosted wallet.
 * Arc testnet is registered as a custom chain so users don't have to add it
 * manually.
 */
import { http, createConfig } from 'wagmi'
import { injected } from 'wagmi/connectors'

const ARC_CHAIN_ID = Number(process.env.NEXT_PUBLIC_ARC_CHAIN_ID || 5042002)
const ARC_RPC_URL  = process.env.NEXT_PUBLIC_ARC_RPC_URL || 'https://rpc.testnet.arc.network'
const ARC_EXPLORER = process.env.NEXT_PUBLIC_ARC_EXPLORER_URL || 'https://testnet.arcscan.app'

// EIP-3085 (wallet_addEthereumChain) requires nativeCurrency.decimals === 18.
// MetaMask rejects anything else outright, which then cascades into a 4902
// "Unrecognized chain ID" on switchChain. USDC is the ERC-20 used for escrow,
// not the chain's gas token — Circle's Paymaster sponsors fees so merchants
// never spend the native token directly. This metadata is therefore only used
// by MetaMask's network UI; the real fund/release/refund txs are paid in USDC.
export const arcTestnet = {
  id: ARC_CHAIN_ID,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: [ARC_RPC_URL] },
    public:  { http: [ARC_RPC_URL] },
  },
  blockExplorers: {
    default: { name: 'Arc Explorer', url: ARC_EXPLORER },
  },
  testnet: true,
}

export const wagmiConfig = createConfig({
  chains: [arcTestnet],
  connectors: [injected({ shimDisconnect: true })],
  transports: {
    [arcTestnet.id]: http(ARC_RPC_URL),
  },
  ssr: true,
})

export const ESCROW_ADDRESS = process.env.NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS
export const USDC_ADDRESS   = process.env.NEXT_PUBLIC_USDC_ADDRESS
export const AGENT_ADDRESS  = process.env.NEXT_PUBLIC_AGENT_WALLET_ADDRESS

export const WALLET_SIGN_MESSAGE = (clerkUserId) =>
  `Connect wallet to OutcomeX ${clerkUserId}`
