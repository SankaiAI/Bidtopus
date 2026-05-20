'use client'
/**
 * Safe renderer for on-chain transaction hashes.
 *
 * Per CLAUDE.md rule "Validate Tx Hashes Before Constructing Explorer Links",
 * any hash that doesn't match the canonical 0x[hex 64] format is rendered as
 * plain text instead of as a clickable link — never embed an unvalidated
 * string into an `<a href>` that we hand to the user's browser.
 */

const TX_HASH_REGEX = /^0x[a-fA-F0-9]{64}$/

// Allowlist of explorers we'll point to. Keeps a compromised env from
// redirecting every tx link to a phishing clone.
const EXPLORER_ALLOWLIST = [
  'https://testnet.arcscan.app',
  'https://arcscan.app',
]

function safeExplorerBase() {
  const fromEnv = process.env.NEXT_PUBLIC_ARC_EXPLORER_URL
  if (fromEnv && EXPLORER_ALLOWLIST.includes(fromEnv.replace(/\/$/, ''))) {
    return fromEnv.replace(/\/$/, '')
  }
  return EXPLORER_ALLOWLIST[0]
}

export function isValidTxHash(hash) {
  return typeof hash === 'string' && TX_HASH_REGEX.test(hash)
}

export function truncateHash(hash) {
  if (!isValidTxHash(hash)) return String(hash ?? '')
  return `${hash.slice(0, 10)}…${hash.slice(-6)}`
}

export default function TxHashLink({ hash, label, style }) {
  if (!isValidTxHash(hash)) {
    return <span style={style}>{String(hash ?? '')}</span>
  }
  const href = `${safeExplorerBase()}/tx/${hash}`
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={style}
    >
      {label || truncateHash(hash)}
    </a>
  )
}
