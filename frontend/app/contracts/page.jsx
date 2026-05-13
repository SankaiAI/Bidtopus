'use client'
import React, { useState } from 'react'
import Link from 'next/link'
import { useOpenMobileSidebar } from '@/components/AppShell'

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

// ─── MOCK DATA ────────────────────────────────────────────────────────────────
const CONTRACTS = [
  {
    id: 'c1',
    name: 'Summer Sale — Retargeting',
    status: 'active',
    targetRoas: 2.0,
    minSpend: 500,
    windowDays: 7,
    fee: 100,
    currentRoas: 1.86,
    spend: 318,
    daysLeft: 3,
    prob: 61,
    createdAt: 'May 9, 2026',
  },
  {
    id: 'c2',
    name: 'New Product Launch',
    status: 'pending_funding',
    targetRoas: 1.8,
    minSpend: 300,
    windowDays: 14,
    fee: 150,
    prob: 72,
    agentNote: 'I estimate a 72% chance of achieving ROAS ≥ 1.8 within 14 days. Terms accepted.',
    createdAt: 'May 11, 2026',
  },
  {
    id: 'c3',
    name: 'Brand Awareness Q1',
    status: 'success',
    targetRoas: 2.5,
    minSpend: 1000,
    windowDays: 30,
    fee: 100,
    finalRoas: 2.73,
    spend: 1042,
    settledAt: 'Apr 28, 2026',
    txHash: '0xabc1...ef45',
  },
  {
    id: 'c4',
    name: 'Flash Sale Push',
    status: 'failure',
    targetRoas: 3.0,
    minSpend: 200,
    windowDays: 3,
    fee: 80,
    finalRoas: 1.94,
    spend: 198,
    settledAt: 'May 2, 2026',
  },
]

const STATUS = {
  active:          { label: 'Active',      dot: C.indigo, badgeColor: C.indigo, badgeBg: 'var(--c-indigo-bg)', pulse: true  },
  pending_funding: { label: 'Fund Now',    dot: C.amber,  badgeColor: C.amber,  badgeBg: 'var(--c-amber-bg)',  pulse: false },
  success:         { label: 'Success',     dot: C.green,  badgeColor: C.green,  badgeBg: 'var(--c-green-bg)',  pulse: false },
  failure:         { label: 'Refunded',    dot: C.faint,  badgeColor: C.muted,  badgeBg: 'var(--c-bg)',        pulse: false },
}

const TABS = [
  { id: 'all',      label: 'All',      filter: () => true },
  { id: 'active',   label: 'Active',   filter: c => c.status === 'active' },
  { id: 'pending',  label: 'Pending',  filter: c => c.status === 'pending_funding' },
  { id: 'resolved', label: 'Resolved', filter: c => ['success', 'failure'].includes(c.status) },
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

// ─── ACTIVE CARD (expanded) ───────────────────────────────────────────────────
function ActiveCard({ c }) {
  const roasPct  = Math.min(100, (c.currentRoas / c.targetRoas) * 100)
  const spendPct = Math.min(100, (c.spend / c.minSpend) * 100)
  const roasColor = roasPct >= 100 ? C.green : roasPct >= 75 ? C.amber : C.indigo
  const probColor = c.prob >= 65 ? C.green : C.amber

  return (
    <Link href={`/contracts/${c.id}`} style={{ display: 'block', textDecoration: 'none' }}>
      <div
        style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '12px', overflow: 'hidden', transition: 'border-color 0.15s, box-shadow 0.15s' }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = C.indigo; e.currentTarget.style.boxShadow = '0 2px 16px rgba(79,70,229,0.09)' }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.boxShadow = 'none' }}
      >
        {/* Top */}
        <div style={{ padding: '18px 20px 16px', borderBottom: `1px solid ${C.borderSub}` }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
            <div style={{ paddingTop: '5px' }}><Dot status="active" /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '15px', fontWeight: 700, color: C.text, fontFamily: font }}>{c.name}</span>
                <Badge status="active" />
              </div>
              <span style={{ fontSize: '12px', color: C.muted, fontFamily: font }}>
                ROAS ≥ {c.targetRoas}× · ${c.minSpend.toLocaleString()} min spend · {c.windowDays} days · {c.fee} USDC success fee
              </span>
            </div>
            {/* Live ROAS */}
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: '28px', fontWeight: 800, color: roasColor, letterSpacing: '-0.04em', lineHeight: 1, fontFamily: font }}>{c.currentRoas.toFixed(2)}×</div>
              <div style={{ fontSize: '11px', color: C.faint, marginTop: '2px', fontFamily: font }}>target {c.targetRoas}×</div>
            </div>
          </div>
        </div>

        {/* Progress */}
        <div style={{ padding: '14px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
              <span style={{ fontSize: '11px', color: C.muted, fontWeight: 500, fontFamily: font }}>ROAS toward target</span>
              <span style={{ fontSize: '12px', fontWeight: 700, color: roasColor, fontFamily: font }}>{roasPct.toFixed(0)}%</span>
            </div>
            <Bar value={c.currentRoas} max={c.targetRoas} color={roasColor} />
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
              <span style={{ fontSize: '11px', color: C.muted, fontWeight: 500, fontFamily: font }}>${c.spend.toLocaleString()} of ${c.minSpend.toLocaleString()} spent</span>
              <span style={{ fontSize: '12px', fontWeight: 700, color: C.sub, fontFamily: font }}>{spendPct.toFixed(0)}%</span>
            </div>
            <Bar value={c.spend} max={c.minSpend} color={C.sub} />
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '0 20px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: '20px' }}>
            <span style={{ fontSize: '12px', color: C.muted, fontFamily: font }}>
              {c.daysLeft} day{c.daysLeft !== 1 ? 's' : ''} remaining
            </span>
            <span style={{ fontSize: '12px', color: C.muted, fontFamily: font }}>
              ML estimate: <span style={{ fontWeight: 700, color: probColor }}>{c.prob}%</span> success
            </span>
          </div>
          <span style={{ fontSize: '11px', color: C.faint, fontFamily: font }}>Created {c.createdAt}</span>
        </div>
      </div>
    </Link>
  )
}

// ─── COMPACT ROW ──────────────────────────────────────────────────────────────
function CompactRow({ c }) {
  const isSuccess = c.status === 'success'
  const isFailure = c.status === 'failure'
  const isPending = c.status === 'pending_funding'

  return (
    <Link href={`/contracts/${c.id}`} style={{ display: 'block', textDecoration: 'none' }}>
      <div
        style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 20px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: '12px', transition: 'border-color 0.15s' }}
        onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--c-border-hover)'}
        onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--c-border)'}
      >
        <Dot status={c.status} />

        {/* Name + meta */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '14px', fontWeight: 600, color: C.text, fontFamily: font, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: '3px' }}>
            {c.name}
          </div>
          <div style={{ fontSize: '12px', color: C.muted, fontFamily: font }}>
            ROAS ≥ {c.targetRoas}× · {c.fee} USDC
            {isPending && <span style={{ color: C.sub }}> · Agent accepted · Awaiting escrow</span>}
            {isSuccess && <span> · Final <span style={{ fontWeight: 600, color: C.green }}>{c.finalRoas}×</span> · Settled {c.settledAt}</span>}
            {isFailure && <span> · Final <span style={{ fontWeight: 600 }}>{c.finalRoas}×</span> · Refunded {c.settledAt}</span>}
          </div>
        </div>

        {/* Right value */}
        {(isSuccess || isFailure) && (
          <div style={{ textAlign: 'right', flexShrink: 0, marginRight: '4px' }}>
            <div style={{ fontSize: '20px', fontWeight: 800, letterSpacing: '-0.03em', color: isSuccess ? C.green : C.muted, fontFamily: font, lineHeight: 1 }}>
              {c.finalRoas}×
            </div>
            <div style={{ fontSize: '10px', color: C.faint, marginTop: '2px' }}>of {c.targetRoas}×</div>
          </div>
        )}
        {isPending && (
          <div style={{ fontSize: '14px', fontWeight: 700, color: C.amber, fontFamily: font, flexShrink: 0, marginRight: '4px' }}>
            {c.fee} USDC
          </div>
        )}

        <Badge status={c.status} />
        {chevron}
      </div>
    </Link>
  )
}

// ─── PAGE ─────────────────────────────────────────────────────────────────────
export default function ContractsPage() {
  const openMobileSidebar = useOpenMobileSidebar()
  const [tab, setTab] = useState('all')

  const filtered = CONTRACTS.filter(TABS.find(t => t.id === tab)?.filter || (() => true))
  const counts = Object.fromEntries(TABS.map(t => [t.id, CONTRACTS.filter(t.filter).length]))

  const active   = filtered.filter(c => c.status === 'active')
  const others   = filtered.filter(c => c.status !== 'active')

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
            <Link href="/contracts/new" style={{
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
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 0' }}>
              <p style={{ fontSize: '14px', color: C.faint, fontFamily: font }}>No contracts here yet.</p>
              <Link href="/contracts/new" style={{ fontSize: '13px', color: C.indigo, fontWeight: 600, textDecoration: 'none', fontFamily: font }}>Create your first contract →</Link>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {active.map(c => <ActiveCard key={c.id} c={c} />)}
              {others.map(c => <CompactRow key={c.id} c={c} />)}
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
