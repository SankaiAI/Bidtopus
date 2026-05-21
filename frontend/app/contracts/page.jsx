'use client'
import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { useAuth } from '@clerk/nextjs'
import { useOpenMobileSidebar } from '@/components/AppShell'
import { useMetaAccount } from '@/contexts/MetaAccountContext'
import { createApiClient } from '@/lib/api'
import { normalizeStatus, isAwaitingFund, isLive, isResolved } from '@/lib/contractStatus'
import { isUnread, requiresAction, getViewedMap } from '@/lib/contractActivity'
import { ContractRowSkeleton } from '@/components/Skeleton'

const C = {
  bg:        'var(--c-bg)',
  surface:   'var(--c-surface)',
  border:    'var(--c-border)',
  borderSub: 'var(--c-border-s)',
  text:      'var(--c-text)',
  sub:       'var(--c-sub)',
  muted:     'var(--c-muted)',
  faint:     'var(--c-faint)',
  indigo:    'var(--c-indigo)',
  green:     'var(--c-green)',
  amber:     'var(--c-amber)',
}

// Maps a normalized status slug to display attributes. Covers every backend
// status so contracts in Created / Underwriting / Offered / Funded show
// sensible labels instead of falling through to a default.
const STATUS = {
  negotiating:     { label: 'Negotiating', dot: C.amber,  badgeColor: C.amber,  badgeBg: 'var(--c-amber-bg)',  pulse: false },
  created:         { label: 'Ready',       dot: C.amber,  badgeColor: C.amber,  badgeBg: 'var(--c-amber-bg)',  pulse: false },
  underwriting:    { label: 'Underwriting',dot: C.indigo, badgeColor: C.indigo, badgeBg: 'var(--c-indigo-bg)', pulse: true  },
  offered:         { label: 'Reviewing',   dot: C.amber,  badgeColor: C.amber,  badgeBg: 'var(--c-amber-bg)',  pulse: false },
  pending_funding: { label: 'Fund Now',    dot: C.amber,  badgeColor: C.amber,  badgeBg: 'var(--c-amber-bg)',  pulse: false },
  funded:          { label: 'Funded',      dot: C.indigo, badgeColor: C.indigo, badgeBg: 'var(--c-indigo-bg)', pulse: false },
  active:          { label: 'Active',      dot: C.indigo, badgeColor: C.indigo, badgeBg: 'var(--c-indigo-bg)', pulse: true  },
  settled:         { label: 'Settled',     dot: C.green,  badgeColor: C.green,  badgeBg: 'var(--c-green-bg)',  pulse: false },
  success:         { label: 'Success',     dot: C.green,  badgeColor: C.green,  badgeBg: 'var(--c-green-bg)',  pulse: false },
  failure:         { label: 'Refunded',    dot: C.faint,  badgeColor: C.muted,  badgeBg: 'var(--c-bg)',        pulse: false },
}

const TABS = [
  { id: 'all',      label: 'All',      filter: () => true },
  { id: 'active',   label: 'Active',   filter: c => isLive(c.status) },
  { id: 'pending',  label: 'Pending',  filter: c => isAwaitingFund(c.status) || c.status === 'negotiating' },
  { id: 'resolved', label: 'Resolved', filter: c => isResolved(c.status) },
]

// ─── ATOMS ────────────────────────────────────────────────────────────────────
function Dot({ status }) {
  const s = STATUS[status] || {}
  return (
    <div style={{
      width: '7px', height: '7px', borderRadius: '50%',
      background: s.dot || C.faint, flexShrink: 0,
      animation: s.pulse ? 'agentThinkPulse 1.5s ease-in-out infinite' : 'none',
    }} />
  )
}

function Badge({ status }) {
  const s = STATUS[status] || { label: status, badgeColor: C.muted, badgeBg: '#f4f4f8' }
  return (
    <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.02em', color: s.badgeColor, background: s.badgeBg, padding: '3px 9px', borderRadius: '20px', whiteSpace: 'nowrap', flexShrink: 0 }}>
      {s.label}
    </span>
  )
}

function Bar({ value, max, color }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100))
  return (
    <div style={{ height: '3px', background: 'var(--c-bar-track)', borderRadius: '2px', overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: '2px' }} />
    </div>
  )
}

const font = 'Plus Jakarta Sans, sans-serif'
const chevron = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ color: 'var(--c-faint)', flexShrink: 0 }}>
    <path d="M5 12h14M12 5l7 7-7 7"/>
  </svg>
)

// ─── ROW ──────────────────────────────────────────────────────────────────────
// Renders a single contract from the API response. Optional fields like
// finalRoas / settledAt come from ContractResponse if backend ticket #71 ran;
// otherwise we render the basics (terms + status) without crashing.
function ContractListRow({ c, viewedMap }) {
  const status = normalizeStatus(c.status)
  const name = c.title || c.campaign_goal || 'Contract'
  const target = c.target_roas
  const fee = c.success_fee_usdc
  const finalRoas = c.final_roas
  const settledAt = c.settled_at ? new Date(c.settled_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null

  const isSuccess = status === 'success'
  const isFailure = status === 'failure'
  const isPending = isAwaitingFund(status)
  const needsAction = requiresAction(status)
  const unread = isUnread(c, viewedMap)

  return (
    <Link href={`/contracts/${c.id}`} style={{ display: 'block', textDecoration: 'none' }}>
      <div
        style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 20px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: '12px', transition: 'border-color 0.15s' }}
        onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--c-border-hover)'}
        onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--c-border)'}
      >
        {/* Leading slot — fixed-width so titles align whether or not an action
            dot renders. Amber pulse only when the agent is waiting on the
            merchant; otherwise the slot is invisible. */}
        <div style={{ width: '7px', flexShrink: 0 }}>
          {needsAction && (
            <div
              title="Action required"
              style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--c-amber)', animation: 'agentThinkPulse 1.5s ease-in-out infinite' }}
            />
          )}
        </div>

        {/* Name + meta */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '14px', fontWeight: unread ? 700 : 600, color: unread ? C.indigo : C.text, fontFamily: font, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: '3px' }}>
            {name}
          </div>
          <div style={{ fontSize: '12px', color: C.muted, fontFamily: font }}>
            {target != null ? `ROAS ≥ ${target}×` : 'ROAS pending'} · {fee != null ? `${fee} USDC` : '—'}
            {isPending && <span style={{ color: C.sub }}> · Awaiting escrow</span>}
            {isSuccess && finalRoas != null && <span> · Final <span style={{ fontWeight: 600, color: C.green }}>{finalRoas}×</span>{settledAt ? ` · Settled ${settledAt}` : ''}</span>}
            {isFailure && finalRoas != null && <span> · Final <span style={{ fontWeight: 600 }}>{finalRoas}×</span>{settledAt ? ` · Refunded ${settledAt}` : ''}</span>}
          </div>
        </div>

        {(isSuccess || isFailure) && finalRoas != null && target != null && (
          <div style={{ textAlign: 'right', flexShrink: 0, marginRight: '4px' }}>
            <div style={{ fontSize: '20px', fontWeight: 800, letterSpacing: '-0.03em', color: isSuccess ? C.green : C.muted, fontFamily: font, lineHeight: 1 }}>
              {finalRoas}×
            </div>
            <div style={{ fontSize: '10px', color: C.faint, marginTop: '2px' }}>of {target}×</div>
          </div>
        )}
        {isPending && fee != null && (
          <div style={{ fontSize: '14px', fontWeight: 700, color: C.amber, fontFamily: font, flexShrink: 0, marginRight: '4px' }}>
            {fee} USDC
          </div>
        )}

        <Badge status={status} />
        {chevron}
      </div>
    </Link>
  )
}

// ─── PAGE ─────────────────────────────────────────────────────────────────────
export default function ContractsPage() {
  const openMobileSidebar = useOpenMobileSidebar()
  const [tab, setTab] = useState('all')
  const [contracts, setContracts] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const { getToken, isLoaded, isSignedIn } = useAuth()
  const { activeAccount } = useMetaAccount()

  // Refetch when the active Meta Ads account changes so the list scopes
  // to that account. Backend filter param ships in ticket #76.
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return
    setLoading(true)
    setError(null)
    const opts = activeAccount?.id ? { metaAdsAccountId: activeAccount.id } : {}
    let cancelled = false
    createApiClient(getToken).listContracts(opts)
      .then(data => { if (!cancelled) setContracts(data || []) })
      .catch(e => { if (!cancelled) setError(e?.message || 'Failed to load contracts') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [isLoaded, isSignedIn, getToken, activeAccount?.id])

  // Add normalized status to every contract once so filters + render share it.
  const normalized = React.useMemo(
    () => contracts.map(c => ({ ...c, _status: normalizeStatus(c.status) })),
    [contracts],
  )
  // TABS filters expect c.status to be normalized — wrap each filter to read _status.
  const filteredItems = normalized.filter(c => {
    const filter = TABS.find(t => t.id === tab)?.filter
    return filter ? filter({ ...c, status: c._status }) : true
  })
  const counts = Object.fromEntries(TABS.map(t => [t.id, normalized.filter(c => t.filter({ ...c, status: c._status })).length]))

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: C.bg }}>

      {/* Mobile header */}
      <div className="app-mobile-header">
        <button onClick={openMobileSidebar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.text, padding: '4px', display: 'flex', marginRight: '12px' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/><path d="M13 9l3 3-3 3"/></svg>
        </button>
        <span style={{ fontSize: '15px', fontWeight: 700, color: C.text, flex: 1, fontFamily: font }}>My Contracts</span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ maxWidth: '860px', margin: '0 auto', padding: '28px 24px 48px' }}>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', gap: '12px' }}>
            <div>
              <h1 style={{ fontSize: '22px', fontWeight: 800, color: C.text, letterSpacing: '-0.03em', margin: '0 0 3px', fontFamily: font }}>My Contracts</h1>
              <p style={{ fontSize: '13px', color: C.muted, margin: 0, fontFamily: font }}>Performance contracts with the AI agent.</p>
            </div>
            <Link href="/workspace/new" style={{
              display: 'inline-flex', alignItems: 'center', gap: '7px',
              background: C.indigo, color: '#fff', fontSize: '13px', fontWeight: 700,
              padding: '9px 18px', borderRadius: '8px', textDecoration: 'none',
              fontFamily: font, flexShrink: 0, transition: 'opacity 0.15s',
            }}
              onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
              onMouseLeave={e => e.currentTarget.style.opacity = '1'}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              New contract
            </Link>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: '2px', marginBottom: '20px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: '10px', padding: '4px' }}>
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  flex: 1, padding: '7px 12px', borderRadius: '7px', border: 'none', cursor: 'pointer',
                  fontSize: '13px', fontWeight: tab === t.id ? 700 : 500,
                  color: tab === t.id ? C.text : C.muted,
                  background: tab === t.id ? C.bg : 'transparent',
                  fontFamily: font, transition: 'background 0.12s, color 0.12s',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                }}
              >
                {t.label}
                <span style={{
                  fontSize: '10px', fontWeight: 700, minWidth: '18px', textAlign: 'center',
                  padding: '1px 5px', borderRadius: '20px',
                  background: tab === t.id ? C.indigo : 'var(--c-bar-track)',
                  color: tab === t.id ? '#fff' : C.faint,
                }}>
                  {counts[t.id]}
                </span>
              </button>
            ))}
          </div>

          {/* Contract list */}
          {error ? (
            <div style={{ textAlign: 'center', padding: '60px 0' }}>
              <p style={{ fontSize: '14px', color: C.red, fontFamily: font }}>{error}</p>
            </div>
          ) : loading && filteredItems.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {Array.from({ length: 4 }, (_, i) => <ContractRowSkeleton key={i} />)}
            </div>
          ) : filteredItems.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 0' }}>
              <p style={{ fontSize: '14px', color: C.faint, fontFamily: font, margin: '0 0 6px' }}>
                {tab === 'all' ? 'No contracts on this account yet.' : 'No contracts match this filter.'}
              </p>
              {tab === 'all' && (
                <Link href="/workspace/new" style={{ fontSize: '13px', color: C.indigo, fontWeight: 600, textDecoration: 'none', fontFamily: font }}>Create your first contract →</Link>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {(() => {
                const viewedMap = getViewedMap()
                return filteredItems.map(c => <ContractListRow key={c.id} c={c} viewedMap={viewedMap} />)
              })()}
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
