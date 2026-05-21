/**
 * Track which contracts the user has viewed so the sidebar / list pages can
 * highlight unread agent activity. State lives in localStorage keyed by
 * contract id, with an ISO timestamp of the most recent visit.
 *
 * A contract is "unread" when its most recent activity timestamp on the
 * ContractResponse is newer than the user's last-viewed timestamp (or the
 * user has never opened it before). "Action required" is a separate signal,
 * derived directly from the contract's status — true while the agent is
 * waiting on a merchant decision.
 */
import { awaitingOfferAcceptance, canFund } from './contractStatus'

const STORAGE_KEY = 'outcomex-last-viewed'

function readMap() {
  if (typeof window === 'undefined') return {}
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') } catch { return {} }
}

function writeMap(m) {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(m)) } catch {}
}

/** Record that the merchant has opened this contract's workspace / detail page. */
export function markViewed(contractId) {
  if (!contractId) return
  const m = readMap()
  m[contractId] = new Date().toISOString()
  writeMap(m)
}

/** Drop the entire viewed cache. Called on Clerk sign-out for privacy. */
export function clearLastViewed() {
  if (typeof window === 'undefined') return
  try { localStorage.removeItem(STORAGE_KEY) } catch {}
}

/** Returns a single { [id]: iso } map; pass to isUnread() so a list render
 *  doesn't hit localStorage once per row. */
export function getViewedMap() {
  return readMap()
}

function contractActivityAt(contract) {
  if (!contract) return null
  return (
    contract.updated_at
    || contract.settled_at
    || contract.resolved_at
    || contract.funded_at
    || contract.created_at
    || null
  )
}

/** True when the contract has newer activity than the user's last visit, or
 *  the user has never opened it. */
export function isUnread(contract, viewedMap) {
  const map = viewedMap || readMap()
  const activityAt = contractActivityAt(contract)
  if (!activityAt) return false
  const viewedAt = map[contract.id]
  if (!viewedAt) return true
  return new Date(activityAt).getTime() > new Date(viewedAt).getTime()
}

/** True when the agent is blocked on the merchant to act — show the pulsing
 *  amber indicator. Covers Offered (accept the offer) and FundedPending (fund
 *  the escrow). Active contracts with pending approval cards would belong
 *  here too once we surface them, but that needs the pending-actions data. */
export function requiresAction(status) {
  return awaitingOfferAcceptance(status) || canFund(status)
}
