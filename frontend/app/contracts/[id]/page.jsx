'use client'
import React, { useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useOpenMobileSidebar } from '@/components/AppShell'

const C = {
  bg:      'var(--c-bg)',
  surface: 'var(--c-surface)',
  border:  'var(--c-border)',
  borderS: 'var(--c-border-s)',
  text:    'var(--c-text)',
  sub:     'var(--c-sub)',
  muted:   'var(--c-muted)',
  faint:   'var(--c-faint)',
  indigo:  'var(--c-indigo)',
  green:   'var(--c-green)',
  amber:   'var(--c-amber)',
  red:     'var(--c-red)',
}
const font = 'Plus Jakarta Sans, sans-serif'

// ─── MOCK CONTRACT DATABASE ───────────────────────────────────────────────────
const ALL = {
  c1: {
    id: 'c1', name: 'Summer Sale — Retargeting', status: 'active',
    targetRoas: 2.0, minSpend: 500, windowDays: 7, fee: 100,
    currentRoas: 1.86, spend: 318, daysLeft: 3, prob: 61, risk: 'Medium',
    expectedRange: [1.7, 2.4], createdAt: 'May 9, 2026',
    agentDecision: 'accept',
    agentNote: 'I estimate a 61% chance of achieving ROAS ≥ 2.0 within 7 days. Your account shows strong retargeting signals from recent traffic. I accept this contract.',
    fundedAt: 'May 9, 2026', fundTxHash: '0xdef4...ab12',
    strategy: {
      summary: 'Retargeting campaign focused on 30-day website visitors using value-oriented creative.',
      actions: [
        { done: true,  text: 'Create retargeting campaign — 30-day website visitors' },
        { done: true,  text: 'Set daily budget $75 with purchase conversion optimization' },
        { done: true,  text: 'Launch 3 ad creatives with product benefit messaging' },
        { done: false, text: 'Shift budget toward best-performing ad set (Day 5)' },
      ],
    },
    roasHistory: [0, 1.22, 1.45, 1.62, 1.74, 1.80, 1.86],
  },
  c2: {
    id: 'c2', name: 'New Product Launch', status: 'pending_funding',
    targetRoas: 1.8, minSpend: 300, windowDays: 14, fee: 150,
    prob: 72, risk: 'Low', expectedRange: [1.6, 2.4], createdAt: 'May 11, 2026',
    agentDecision: 'accept',
    agentNote: 'I estimate a 72% chance of achieving ROAS ≥ 1.8 within 14 days. Product category and average order value support this target with moderate risk. I accept this contract at 150 USDC.',
  },
  c3: {
    id: 'c3', name: 'Brand Awareness Q1', status: 'success',
    targetRoas: 2.5, minSpend: 1000, windowDays: 30, fee: 100,
    finalRoas: 2.73, spend: 1042, settledAt: 'Apr 28, 2026', createdAt: 'Mar 29, 2026',
    prob: 68, risk: 'Medium', expectedRange: [2.1, 3.1],
    agentDecision: 'accept',
    agentNote: 'I estimate a 68% chance of achieving ROAS ≥ 2.5 within 30 days. The longer evaluation window and account data support this. I accept.',
    fundedAt: 'Mar 29, 2026', fundTxHash: '0x1234...5678', settleTxHash: '0xabc1...ef45',
    strategy: {
      summary: 'Multi-audience approach with cold lookalikes and warm retargeting using seasonal creative.',
      actions: [
        { done: true, text: 'Launch 1–3% lookalike campaign from purchaser seed list' },
        { done: true, text: 'Retargeting campaign for 14-day engaged visitors' },
        { done: true, text: 'Dynamic product ads for cart abandoners' },
        { done: true, text: 'Reallocated 60% of budget to best ad set on Day 14' },
      ],
    },
    roasHistory: [0, 1.8, 2.05, 2.18, 2.32, 2.45, 2.56, 2.64, 2.70, 2.73],
  },
  c4: {
    id: 'c4', name: 'Flash Sale Push', status: 'failure',
    targetRoas: 3.0, minSpend: 200, windowDays: 3, fee: 80,
    finalRoas: 1.94, spend: 198, settledAt: 'May 2, 2026', createdAt: 'Apr 29, 2026',
    prob: 41, risk: 'High', expectedRange: [1.5, 2.8],
    agentDecision: 'counteroffer',
    agentNote: 'ROAS ≥ 3.0 in 3 days carries high risk — 41% probability. I proposed ROAS ≥ 2.5 or extending to 7 days. Merchant chose to proceed with original terms. Contract accepted under revised risk disclosure.',
    fundedAt: 'Apr 29, 2026', fundTxHash: '0x9876...dcba', refundTxHash: '0xfeed...cafe',
    strategy: {
      summary: 'Flash sale campaign targeting high-intent audiences with countdown urgency creative.',
      actions: [
        { done: true, text: 'Flash sale campaign with countdown ad formats' },
        { done: true, text: 'Targeted previous purchasers and recent cart abandoners' },
        { done: true, text: 'Maximized budget delivery over 72-hour window' },
      ],
    },
    roasHistory: [0, 2.1, 2.28, 1.94],
  },
}

// ─── TIMELINE STAGES ──────────────────────────────────────────────────────────
function buildStages(c) {
  const currentIdx = { pending_funding: 3, active: 4, success: 7, failure: 7 }[c.status] ?? 0
  const raw = [
    { label: 'Contract created',
      note: c.createdAt },
    { label: 'ML underwriting',
      note: `${c.prob}% probability · ${c.risk} risk · expected ${c.expectedRange[0]}–${c.expectedRange[1]}×` },
    { label: c.agentDecision === 'counteroffer' ? 'Agent countered → accepted' : 'Agent accepted',
      note: null },
    { label: 'Escrow funded',
      note: c.fundedAt ? `${c.fee} USDC locked on Arc · ${c.fundedAt}` : null },
    { label: 'Campaign running',
      note: c.status === 'active' ? `Day ${c.windowDays - c.daysLeft} of ${c.windowDays}` : c.fundedAt ? 'Completed' : null },
    { label: 'Outcome resolved',
      note: c.status === 'success' ? `ROAS ${c.finalRoas}× — target met ✓` : c.status === 'failure' ? `ROAS ${c.finalRoas}× — target missed` : null },
    { label: 'Settlement',
      note: c.status === 'success' ? `${c.fee} USDC released to agent · ${c.settledAt}` : c.status === 'failure' ? `${c.fee} USDC refunded to wallet · ${c.settledAt}` : null },
  ]
  return raw.map((s, i) => ({ ...s, state: i < currentIdx ? 'done' : i === currentIdx ? 'current' : 'upcoming' }))
}

// ─── ROAS CHART ───────────────────────────────────────────────────────────────
function RoasChart({ data, target, color }) {
  const W = 500, H = 100, pX = 8, pY = 12
  const vals = data.filter((_, i) => i > 0)
  const all  = [...vals, target]
  const min  = Math.min(...all) * 0.80
  const max  = Math.max(...all) * 1.12
  const rng  = max - min || 1
  const xi   = i => pX + (i / (vals.length - 1 || 1)) * (W - pX * 2)
  const yi   = v => H - pY - ((v - min) / rng) * (H - pY * 2)
  const line = vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${xi(i).toFixed(1)},${yi(v).toFixed(1)}`).join(' ')
  const area = `${line} L${xi(vals.length-1).toFixed(1)},${H} L${xi(0).toFixed(1)},${H} Z`
  const tY   = yi(target)
  const gid  = 'cg'
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible', display: 'block' }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <line x1={pX} y1={tY} x2={W-pX} y2={tY} stroke={C.green} strokeWidth="1" strokeDasharray="5,4" opacity="0.7"/>
      <text x={W-pX+4} y={tY+4} fontSize="9" fill={C.green} fontFamily={font}>target {target}×</text>
      <path d={area} fill={`url(#${gid})`}/>
      <path d={line} stroke={color} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx={xi(vals.length-1)} cy={yi(vals[vals.length-1])} r="4" fill={color} stroke="#fff" strokeWidth="1.5"/>
    </svg>
  )
}

// ─── SHARED ATOMS ─────────────────────────────────────────────────────────────
function Card({ children, style = {} }) {
  return <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '12px', overflow: 'hidden', ...style }}>{children}</div>
}
function CardHead({ children }) {
  return <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.borderS}`, fontSize: '12px', fontWeight: 700, color: C.sub, fontFamily: font, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{children}</div>
}
function Bar({ value, max, color }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100))
  return (
    <div style={{ height: '4px', background: 'var(--c-bar-track)', borderRadius: '2px', overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: '2px', transition: 'width 0.4s' }}/>
    </div>
  )
}
function TxRow({ label, hash }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
      <span style={{ fontSize: '12px', color: C.muted, fontFamily: font }}>{label}</span>
      <span style={{ fontSize: '11px', fontWeight: 600, color: C.indigo, fontFamily: font, fontVariantNumeric: 'tabular-nums' }}>{hash}</span>
    </div>
  )
}

// ─── LIVE MONITOR ─────────────────────────────────────────────────────────────
function LiveMonitor({ c }) {
  const roasPct  = Math.min(100, (c.currentRoas / c.targetRoas) * 100)
  const spendPct = Math.min(100, (c.spend / c.minSpend) * 100)
  const roasColor = roasPct >= 100 ? C.green : roasPct >= 80 ? C.amber : C.indigo
  const probColor = c.prob >= 65 ? C.green : C.amber

  return (
    <Card>
      <CardHead>Live Performance</CardHead>
      <div style={{ padding: '20px 18px 16px' }}>
        {/* Hero number */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px', marginBottom: '4px' }}>
          <div style={{ fontSize: '48px', fontWeight: 800, color: roasColor, letterSpacing: '-0.04em', lineHeight: 1, fontFamily: font }}>{c.currentRoas.toFixed(2)}<span style={{ fontSize: '28px' }}>×</span></div>
          <div style={{ paddingBottom: '6px' }}>
            <div style={{ fontSize: '13px', color: C.muted, fontFamily: font }}>current ROAS</div>
            <div style={{ fontSize: '13px', color: C.muted, fontFamily: font }}>target <span style={{ fontWeight: 700, color: C.sub }}>{c.targetRoas}×</span></div>
          </div>
          <div style={{ marginLeft: 'auto', textAlign: 'right', paddingBottom: '4px' }}>
            <div style={{ fontSize: '22px', fontWeight: 800, color: probColor, fontFamily: font, lineHeight: 1 }}>{c.prob}%</div>
            <div style={{ fontSize: '12px', color: C.muted, fontFamily: font }}>ML success estimate</div>
          </div>
        </div>

        {/* Chart */}
        <div style={{ margin: '16px 0' }}>
          <RoasChart data={c.roasHistory} target={c.targetRoas} color={roasColor} />
        </div>

        {/* Progress bars */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px', marginTop: '4px' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ fontSize: '12px', color: C.muted, fontFamily: font }}>ROAS toward target</span>
              <span style={{ fontSize: '12px', fontWeight: 700, color: roasColor, fontFamily: font }}>{roasPct.toFixed(0)}%</span>
            </div>
            <Bar value={c.currentRoas} max={c.targetRoas} color={roasColor} />
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ fontSize: '12px', color: C.muted, fontFamily: font }}>${c.spend.toLocaleString()} of ${c.minSpend.toLocaleString()} min spend</span>
              <span style={{ fontSize: '12px', fontWeight: 700, color: C.sub, fontFamily: font }}>{spendPct.toFixed(0)}%</span>
            </div>
            <Bar value={c.spend} max={c.minSpend} color={C.sub} />
          </div>
        </div>
      </div>
      <div style={{ padding: '10px 18px 14px', borderTop: `1px solid ${C.borderS}`, display: 'flex', gap: '24px' }}>
        <span style={{ fontSize: '12px', color: C.muted, fontFamily: font }}>{c.daysLeft} day{c.daysLeft !== 1 ? 's' : ''} remaining</span>
        <span style={{ fontSize: '12px', color: C.muted, fontFamily: font }}>Started {c.createdAt}</span>
      </div>
    </Card>
  )
}

// ─── FUND ESCROW PANEL ────────────────────────────────────────────────────────
function FundEscrowPanel({ c }) {
  return (
    <Card>
      <CardHead>Fund Escrow to Begin</CardHead>
      <div style={{ padding: '20px 18px' }}>
        {/* Agent note */}
        <div style={{ background: 'var(--c-indigo-subtle)', border: '1px solid var(--c-indigo-border)', borderRadius: '10px', padding: '14px 16px', marginBottom: '20px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: C.indigo, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: font }}>Agent decision — Accepted</div>
          <p style={{ fontSize: '13px', color: C.sub, lineHeight: 1.7, margin: 0, fontFamily: font }}>"{c.agentNote}"</p>
          <div style={{ marginTop: '10px', display: 'flex', gap: '20px' }}>
            <span style={{ fontSize: '12px', color: C.muted, fontFamily: font }}>Success probability: <span style={{ fontWeight: 700, color: C.green }}>{c.prob}%</span></span>
            <span style={{ fontSize: '12px', color: C.muted, fontFamily: font }}>Risk level: <span style={{ fontWeight: 600, color: C.sub }}>{c.risk}</span></span>
          </div>
        </div>

        {/* Terms summary */}
        <div style={{ border: `1px solid ${C.border}`, borderRadius: '8px', overflow: 'hidden', marginBottom: '20px' }}>
          {[
            ['Target',      `ROAS ≥ ${c.targetRoas}×`],
            ['Minimum spend', `$${c.minSpend.toLocaleString()}`],
            ['Time window', `${c.windowDays} days`],
            ['Success fee', `${c.fee} USDC`],
          ].map(([k, v], i, arr) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderBottom: i < arr.length - 1 ? `1px solid ${C.borderS}` : 'none', background: i % 2 === 0 ? '#fafafa' : C.surface }}>
              <span style={{ fontSize: '12px', color: C.muted, fontFamily: font }}>{k}</span>
              <span style={{ fontSize: '13px', fontWeight: 600, color: C.sub, fontFamily: font }}>{v}</span>
            </div>
          ))}
        </div>

        {/* CTA */}
        <button style={{ width: '100%', padding: '13px', borderRadius: '9px', border: 'none', background: C.indigo, color: '#fff', fontSize: '14px', fontWeight: 700, cursor: 'pointer', fontFamily: font, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', transition: 'opacity 0.15s' }}
          onMouseEnter={e => e.currentTarget.style.opacity = '0.88'}
          onMouseLeave={e => e.currentTarget.style.opacity = '1'}
        >
          Lock {c.fee} USDC in Arc Escrow
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </button>
        <p style={{ fontSize: '11px', color: C.faint, textAlign: 'center', margin: '10px 0 0', fontFamily: font, lineHeight: 1.6 }}>
          Settlement is enforced by a smart contract on Arc — not by OutcomeX. Neither party can override it.
        </p>
      </div>
    </Card>
  )
}

// ─── RESOLUTION PANEL ─────────────────────────────────────────────────────────
function ResolutionPanel({ c }) {
  const isSuccess = c.status === 'success'
  const accentColor = isSuccess ? C.green : C.muted
  const txHash = isSuccess ? c.settleTxHash : c.refundTxHash

  return (
    <Card>
      <CardHead>{isSuccess ? 'Contract Settled — Success' : 'Contract Closed — Refunded'}</CardHead>
      <div style={{ padding: '20px 18px' }}>
        {/* Outcome hero */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px', padding: '16px', background: isSuccess ? 'var(--c-green-bg)' : 'var(--c-bg)', borderRadius: '10px', border: `1px solid ${isSuccess ? 'var(--c-green-border)' : C.border}` }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: isSuccess ? 'var(--c-green-light)' : 'var(--c-bar-track)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {isSuccess
              ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            }
          </div>
          <div>
            <div style={{ fontSize: '28px', fontWeight: 800, color: accentColor, letterSpacing: '-0.04em', lineHeight: 1, fontFamily: font }}>{c.finalRoas}×</div>
            <div style={{ fontSize: '12px', color: C.muted, marginTop: '3px', fontFamily: font }}>
              {isSuccess ? `Exceeded target of ${c.targetRoas}×` : `Target was ${c.targetRoas}×`}
            </div>
          </div>
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <div style={{ fontSize: '18px', fontWeight: 800, color: isSuccess ? C.green : C.sub, fontFamily: font }}>{c.fee} USDC</div>
            <div style={{ fontSize: '12px', color: C.muted, fontFamily: font }}>{isSuccess ? 'released to agent' : 'refunded to wallet'}</div>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '18px' }}>
          {[
            ['Total spend',   `$${c.spend.toLocaleString()}`],
            ['Min. required', `$${c.minSpend.toLocaleString()}`],
            ['Final ROAS',    `${c.finalRoas}×`],
            ['Target ROAS',   `${c.targetRoas}×`],
          ].map(([k, v]) => (
            <div key={k} style={{ padding: '10px 12px', background: 'var(--c-bg)', borderRadius: '8px', border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: '11px', color: C.faint, fontFamily: font, marginBottom: '3px' }}>{k}</div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: C.sub, fontFamily: font }}>{v}</div>
            </div>
          ))}
        </div>

        {/* Settlement tx */}
        <div style={{ border: `1px solid ${C.border}`, borderRadius: '8px', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <TxRow label="Settlement transaction" hash={txHash} />
          <TxRow label="Settled" hash={c.settledAt} />
        </div>
      </div>
    </Card>
  )
}

// ─── STRATEGY PANEL ───────────────────────────────────────────────────────────
function StrategyPanel({ strategy }) {
  if (!strategy) return null
  return (
    <Card>
      <CardHead>Agent Strategy</CardHead>
      <div style={{ padding: '14px 18px' }}>
        <p style={{ fontSize: '13px', color: C.sub, lineHeight: 1.7, margin: '0 0 14px', fontFamily: font }}>{strategy.summary}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {strategy.actions.map((a, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              <div style={{ width: '18px', height: '18px', borderRadius: '50%', background: a.done ? '#f0fdf4' : '#f5f3ff', border: `1.5px solid ${a.done ? C.green : C.faint}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '1px' }}>
                {a.done
                  ? <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                  : <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: C.faint }} />
                }
              </div>
              <span style={{ fontSize: '13px', color: a.done ? C.sub : C.muted, fontFamily: font, lineHeight: 1.5 }}>{a.text}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  )
}

// ─── AGENT DECISION CARD ──────────────────────────────────────────────────────
function AgentDecisionCard({ c }) {
  const isCounter = c.agentDecision === 'counteroffer'
  return (
    <Card>
      <CardHead>Agent Decision</CardHead>
      <div style={{ padding: '14px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: isCounter ? C.amber : C.green, flexShrink: 0 }} />
          <span style={{ fontSize: '12px', fontWeight: 700, color: isCounter ? C.amber : C.green, fontFamily: font, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {isCounter ? 'Countered → Accepted' : 'Accepted'}
          </span>
          <span style={{ marginLeft: 'auto', fontSize: '11px', color: C.faint, fontFamily: font }}>ML probability: <span style={{ fontWeight: 700 }}>{c.prob}%</span></span>
        </div>
        <p style={{ fontSize: '13px', color: C.sub, lineHeight: 1.7, margin: '0 0 10px', fontFamily: font }}>"{c.agentNote}"</p>
        <div style={{ display: 'flex', gap: '16px' }}>
          <span style={{ fontSize: '12px', color: C.muted, fontFamily: font }}>Expected range: <span style={{ fontWeight: 600, color: C.sub }}>{c.expectedRange[0]}–{c.expectedRange[1]}×</span></span>
          <span style={{ fontSize: '12px', color: C.muted, fontFamily: font }}>Risk: <span style={{ fontWeight: 600, color: C.sub }}>{c.risk}</span></span>
        </div>
      </div>
    </Card>
  )
}

// ─── TIMELINE SIDEBAR ─────────────────────────────────────────────────────────
function Timeline({ stages }) {
  return (
    <Card>
      <CardHead>Lifecycle</CardHead>
      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '0' }}>
        {stages.map((s, i) => {
          const isDone     = s.state === 'done'
          const isCurrent  = s.state === 'current'
          const isLast     = i === stages.length - 1
          const dotColor   = isDone ? C.indigo : isCurrent ? C.amber : C.faint
          const lineColor  = isDone ? C.indigo : '#e8e7f2'

          return (
            <div key={i} style={{ display: 'flex', gap: '12px' }}>
              {/* Dot + line */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: isDone || isCurrent ? dotColor : 'transparent', border: `2px solid ${dotColor}`, flexShrink: 0, animation: isCurrent ? 'agentThinkPulse 1.5s ease-in-out infinite' : 'none' }} />
                {!isLast && <div style={{ width: '2px', flex: 1, minHeight: '18px', background: lineColor, margin: '3px 0', borderRadius: '1px', opacity: isDone ? 1 : 0.35 }} />}
              </div>
              {/* Label */}
              <div style={{ paddingBottom: isLast ? '0' : '14px', flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '12px', fontWeight: isDone || isCurrent ? 600 : 400, color: isDone || isCurrent ? C.sub : C.faint, fontFamily: font }}>{s.label}</div>
                {s.note && <div style={{ fontSize: '11px', color: C.faint, fontFamily: font, marginTop: '2px', lineHeight: 1.5 }}>{s.note}</div>}
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

// ─── TERMS SIDEBAR ────────────────────────────────────────────────────────────
function TermsCard({ c }) {
  const rows = [
    ['Target metric', `ROAS ≥ ${c.targetRoas}×`],
    ['Minimum spend', `$${c.minSpend.toLocaleString()}`],
    ['Time window',   `${c.windowDays} days`],
    ['Success fee',   `${c.fee} USDC`],
  ]
  if (c.fundTxHash) rows.push(['Fund tx', c.fundTxHash])

  const showWorkspace = c.status === 'active' || c.status === 'pending_funding'

  return (
    <Card>
      <CardHead>Contract Terms</CardHead>
      <div style={{ padding: '4px 0 8px' }}>
        {rows.map(([k, v]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 16px', gap: '12px' }}>
            <span style={{ fontSize: '12px', color: C.muted, fontFamily: font, flexShrink: 0 }}>{k}</span>
            <span style={{ fontSize: '12px', fontWeight: 600, color: C.sub, fontFamily: font, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v}</span>
          </div>
        ))}
      </div>
      <div style={{ padding: '8px 14px 14px', borderTop: `1px solid #f0eef8`, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {showWorkspace && (
          <Link
            href={`/workspace/${c.id}`}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
              width: '100%', padding: '10px', borderRadius: '8px', textDecoration: 'none',
              background: C.indigo, color: '#fff',
              fontSize: '13px', fontWeight: 700, fontFamily: font,
              transition: 'opacity 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.88'}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
          >
            Open in Workspace
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
          </Link>
        )}
        <a
          href="https://adsmanager.facebook.com"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
            width: '100%', padding: '10px', borderRadius: '8px', textDecoration: 'none',
            background: 'transparent', color: C.sub,
            border: `1px solid ${C.border}`,
            fontSize: '13px', fontWeight: 600, fontFamily: font,
            transition: 'background 0.15s, border-color 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = '#f5f3ff'; e.currentTarget.style.borderColor = C.indigo }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = C.border }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="#1877F2">
            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
          </svg>
          View in Meta Ads
        </a>
      </div>
    </Card>
  )
}

// ─── STATUS BADGE ─────────────────────────────────────────────────────────────
const STATUS_LABEL = { active: 'Active', pending_funding: 'Awaiting Escrow', success: 'Success', failure: 'Refunded' }
const STATUS_COLORS = {
  active:          { color: C.indigo, bg: 'var(--c-indigo-bg)' },
  pending_funding: { color: C.amber,  bg: 'var(--c-amber-bg)'  },
  success:         { color: C.green,  bg: 'var(--c-green-bg)'  },
  failure:         { color: C.muted,  bg: 'var(--c-bg)'        },
}

// ─── PAGE ─────────────────────────────────────────────────────────────────────
export default function ContractDetailPage() {
  const { id } = useParams()
  const openMobileSidebar = useOpenMobileSidebar()
  const [isMobile, setIsMobile] = React.useState(false)

  React.useLayoutEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const c = ALL[id]
  if (!c) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg }}>
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: '14px', color: C.muted, fontFamily: font, marginBottom: '12px' }}>Contract not found.</p>
        <Link href="/contracts" style={{ fontSize: '13px', color: C.indigo, fontWeight: 600, textDecoration: 'none', fontFamily: font }}>← Back to My Contracts</Link>
      </div>
    </div>
  )

  const stages       = buildStages(c)
  const badge        = STATUS_COLORS[c.status] || STATUS_COLORS.failure
  const badgeLabel   = STATUS_LABEL[c.status] || c.status

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: C.bg }}>

      {/* Mobile header */}
      <div className="app-mobile-header">
        <button onClick={openMobileSidebar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.text, padding: '4px', display: 'flex', marginRight: '12px' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/><path d="M13 9l3 3-3 3"/></svg>
        </button>
        <span style={{ fontSize: '15px', fontWeight: 700, color: C.text, flex: 1, fontFamily: font, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ maxWidth: '1080px', margin: '0 auto', padding: '24px 24px 48px' }}>

          {/* Back link */}
          <Link href="/contracts" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: C.muted, textDecoration: 'none', fontFamily: font, marginBottom: '16px', transition: 'color 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.color = C.sub}
            onMouseLeave={e => e.currentTarget.style.color = C.muted}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
            My Contracts
          </Link>

          {/* Page header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px', flexWrap: 'wrap' }}>
                <h1 style={{ fontSize: '22px', fontWeight: 800, color: C.text, letterSpacing: '-0.03em', margin: 0, fontFamily: font }}>{c.name}</h1>
                <span style={{ fontSize: '11px', fontWeight: 700, color: badge.color, background: badge.bg, padding: '3px 10px', borderRadius: '20px', whiteSpace: 'nowrap' }}>{badgeLabel}</span>
              </div>
              <p style={{ fontSize: '13px', color: C.muted, margin: 0, fontFamily: font }}>
                ROAS ≥ {c.targetRoas}× · ${c.minSpend.toLocaleString()} min spend · {c.windowDays} days · {c.fee} USDC fee · Created {c.createdAt}
              </p>
            </div>
          </div>

          {/* Two-column grid */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 320px', gap: '16px', alignItems: 'start' }}>

            {/* ── Main column ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {c.status === 'active'          && <LiveMonitor c={c} />}
              {c.status === 'pending_funding' && <FundEscrowPanel c={c} />}
              {(c.status === 'success' || c.status === 'failure') && <ResolutionPanel c={c} />}
              {c.strategy && <StrategyPanel strategy={c.strategy} />}
              {c.status !== 'pending_funding' && <AgentDecisionCard c={c} />}
            </div>

            {/* ── Right sidebar ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <Timeline stages={stages} />
              <TermsCard c={c} />
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}
