/**
 * Contract status — backend ↔ frontend translation.
 *
 * Backend uses PascalCase per the system diagram:
 *   Created → Underwriting → Offered → FundedPending → Funded → Active → Settled
 *
 * Frontend code (mock data + UI conditionals) uses lowercase slugs:
 *   created, underwriting, offered, pending_funding, funded, active, settled, success, failure
 *
 * This module is the one chokepoint that converts. Use `normalizeStatus(raw)`
 * everywhere a status string crosses the boundary.
 */

const BACKEND_TO_FRONTEND = {
  Created:       'created',
  Underwriting:  'underwriting',
  Offered:       'offered',
  FundedPending: 'pending_funding',
  Funded:        'funded',
  Active:        'active',
  Settled:       'settled',
  Negotiating:   'negotiating',
}

export function normalizeStatus(raw) {
  if (!raw) return ''
  if (BACKEND_TO_FRONTEND[raw]) return BACKEND_TO_FRONTEND[raw]
  return String(raw).toLowerCase()
}

/** A contract that the merchant has not yet locked USDC for. */
export function isAwaitingFund(status) {
  const s = normalizeStatus(status)
  return s === 'created' || s === 'underwriting' || s === 'offered' || s === 'pending_funding'
}

/** Tight gate for the Fund button — backend's fund_escrow requires exactly FundedPending. */
export function canFund(status) {
  return normalizeStatus(status) === 'pending_funding'
}

/** The merchant must accept the agent's offer before they can fund. */
export function awaitingOfferAcceptance(status) {
  return normalizeStatus(status) === 'offered'
}

/** A live, funded contract. */
export function isLive(status) {
  const s = normalizeStatus(status)
  return s === 'funded' || s === 'active'
}

/** A fully settled (resolved) contract — outcome may be success or failure. */
export function isResolved(status) {
  const s = normalizeStatus(status)
  return s === 'settled' || s === 'success' || s === 'failure'
}
