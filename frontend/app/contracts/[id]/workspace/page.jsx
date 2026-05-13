'use client'
import React from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useOpenMobileSidebar } from '@/components/AppShell'
import AgentInputBar from '@/components/AgentInputBar'

const C = {
  bg:          'var(--c-bg)',
  surface:     'var(--c-surface)',
  surfaceAlt:  'var(--c-surface-alt)',
  border:      'var(--c-border)',
  borderS:     'var(--c-border-s)',
  text:        'var(--c-text)',
  sub:         'var(--c-sub)',
  muted:       'var(--c-muted)',
  faint:       'var(--c-faint)',
  indigo:      'var(--c-indigo)',
  green:       'var(--c-green)',
  amber:       'var(--c-amber)',
  red:         'var(--c-red)',
  userBg:      'var(--c-user-bg)',
  indigoGlow:  'var(--c-indigo-glow)',
  indigoBg:    'var(--c-indigo-bg)',
  greenBg:     'var(--c-green-bg)',
  greenLight:  'var(--c-green-light)',
  greenBorder: 'var(--c-green-border)',
}
const font = 'Plus Jakarta Sans, sans-serif'

// ─── MOCK CONTRACT DATA ───────────────────────────────────────────────────────
const ALL = {
  c1: {
    id: 'c1', name: 'Summer Sale — Retargeting', status: 'active',
    targetRoas: 2.0, minSpend: 500, windowDays: 7, fee: 100,
    currentRoas: 1.86, spend: 318, daysLeft: 3, prob: 61, risk: 'Medium',
    expectedRange: [1.7, 2.4], createdAt: 'May 9, 2026',
    agentDecision: 'accept', fundedAt: 'May 9, 2026', fundTxHash: '0xdef4...ab12',
    agentNote: 'I estimate a 61% chance of achieving ROAS ≥ 2.0 within 7 days. Your account shows strong retargeting signals from recent traffic. I accept this contract.',
    roasHistory: [0, 1.22, 1.45, 1.62, 1.74, 1.80, 1.86],
    strategy: {
      summary: 'Retargeting campaign focused on 30-day website visitors using value-oriented creative.',
      actions: [
        { done: true,  text: 'Create retargeting campaign — 30-day website visitors' },
        { done: true,  text: 'Set daily budget $75 with purchase conversion optimization' },
        { done: true,  text: 'Launch 3 ad creatives with product benefit messaging' },
        { done: false, text: 'Shift budget toward best-performing ad set (Day 5)' },
      ],
    },
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
    fundedAt: 'Mar 29, 2026', settleTxHash: '0xabc1...ef45',
    roasHistory: [0, 1.8, 2.05, 2.18, 2.32, 2.45, 2.56, 2.64, 2.70, 2.73],
    strategy: {
      summary: 'Multi-audience approach with cold lookalikes and warm retargeting using seasonal creative.',
      actions: [
        { done: true, text: 'Launch 1–3% lookalike campaign from purchaser seed list' },
        { done: true, text: 'Retargeting campaign for 14-day engaged visitors' },
        { done: true, text: 'Dynamic product ads for cart abandoners' },
        { done: true, text: 'Reallocated 60% of budget to best ad set on Day 14' },
      ],
    },
  },
  c4: {
    id: 'c4', name: 'Flash Sale Push', status: 'failure',
    targetRoas: 3.0, minSpend: 200, windowDays: 3, fee: 80,
    finalRoas: 1.94, spend: 198, settledAt: 'May 2, 2026', createdAt: 'Apr 29, 2026',
    prob: 41, risk: 'High', expectedRange: [1.5, 2.8],
    agentDecision: 'counteroffer',
    agentNote: 'ROAS ≥ 3.0 in 3 days carries high risk — 41% probability. I proposed ROAS ≥ 2.5 or extending to 7 days. Merchant chose to proceed with original terms.',
    fundedAt: 'Apr 29, 2026', refundTxHash: '0xfeed...cafe',
    roasHistory: [0, 2.1, 2.28, 1.94],
    strategy: {
      summary: 'Flash sale campaign targeting high-intent audiences with countdown urgency creative.',
      actions: [
        { done: true, text: 'Flash sale campaign with countdown ad formats' },
        { done: true, text: 'Targeted previous purchasers and recent cart abandoners' },
        { done: true, text: 'Maximized budget delivery over 72-hour window' },
      ],
    },
  },
}

function buildStages(c) {
  const currentIdx = { pending_funding: 3, active: 4, success: 7, failure: 7 }[c.status] ?? 0
  const raw = [
    { label: 'Contract created',  note: c.createdAt },
    { label: 'ML underwriting',   note: `${c.prob}% probability · ${c.risk} risk · expected ${c.expectedRange[0]}–${c.expectedRange[1]}×` },
    { label: c.agentDecision === 'counteroffer' ? 'Agent countered → accepted' : 'Agent accepted', note: null },
    { label: 'Escrow funded',     note: c.fundedAt ? `${c.fee} USDC locked · ${c.fundedAt}` : null },
    { label: 'Campaign running',  note: c.status === 'active' ? `Day ${c.windowDays - c.daysLeft} of ${c.windowDays}` : c.fundedAt ? 'Completed' : null },
    { label: 'Outcome resolved',  note: c.status === 'success' ? `ROAS ${c.finalRoas}× ✓` : c.status === 'failure' ? `ROAS ${c.finalRoas}× — missed` : null },
    { label: 'Settlement',        note: c.status === 'success' ? `${c.fee} USDC released · ${c.settledAt}` : c.status === 'failure' ? `${c.fee} USDC refunded · ${c.settledAt}` : null },
  ]
  return raw.map((s, i) => ({ ...s, state: i < currentIdx ? 'done' : i === currentIdx ? 'current' : 'upcoming' }))
}

const STATUS_LABEL  = { active: 'Active', pending_funding: 'Awaiting Escrow', success: 'Success', failure: 'Refunded' }
const STATUS_COLORS = {
  active:          { color: C.indigo, bg: 'var(--c-indigo-bg)' },
  pending_funding: { color: C.amber,  bg: 'var(--c-amber-bg)'  },
  success:         { color: C.green,  bg: 'var(--c-green-bg)'  },
  failure:         { color: C.muted,  bg: 'var(--c-bg)'        },
}

// ─── MOCK CHAT HISTORIES ──────────────────────────────────────────────────────
const CHATS = {
  c1: [
    { role: 'user',         text: 'I want to run a retargeting campaign for my summer sale. Target ROAS 2.0 with $500 minimum spend over 7 days.',                                                                                                                                    time: 'May 9 · 9:02 AM' },
    { role: 'agent',        text: "I've analyzed your Meta account. Your 30-day website visitor audience shows strong purchase intent signals.\n\nI estimate a **61% chance** of achieving ROAS ≥ 2.0 within 7 days. My strategy: retargeting campaign targeting 30-day site visitors with value-oriented creative, optimizing for purchases at $75/day.\n\nMy success fee is **100 USDC**, locked in Arc escrow — you only pay if I hit your target.", time: 'May 9 · 9:02 AM' },
    { role: 'user',         text: "Let's go.",                                                                                                                                                                                                                                        time: 'May 9 · 9:04 AM' },
    { role: 'system',       text: 'Contract created · Escrow funded · Campaign launched',                                                                                                                                                                                              time: 'May 9 · 9:05 AM' },
    { role: 'agent-update', text: 'Day 1 complete. Current ROAS: 1.22×. Purchase volume is tracking well — keeping current budget split across 3 ad sets.',                                                                                                                            time: 'May 10 · 8:15 AM' },
    { role: 'agent-update', text: 'Day 2: ROAS improved to 1.45×. Ad set B is outperforming by 22%. Shifting 15% more budget there tomorrow.',                                                                                                                                         time: 'May 11 · 8:30 AM' },
    { role: 'agent-update', text: 'Day 3: ROAS 1.62×. Budget reallocation working — ad set B now drives 58% of conversions. On track.',                                                                                                                                               time: 'May 12 · 8:10 AM' },
    { role: 'agent-update', text: 'Day 4: ROAS 1.74×. Trending strong. Maximizing delivery over the final 3 days.',                                                                                                                                                                   time: 'May 12 · 5:30 PM' },
  ],
  c2: [
    { role: 'user',   text: 'Launching a new product next week. Target ROAS 1.8 with $300 minimum spend, 14 days.',                                                                                                                                                                    time: 'May 11 · 2:00 PM' },
    { role: 'agent',  text: "New product launches are tricky without historical data — let me analyze your account.\n\nYour product category and average order value ($87) support a **1.8× target**. Similar launches average 1.6–2.4× within 14 days. I estimate **72% probability**.\n\nI'll start broad — testing 4 interest segments — then rapidly scale winners. My fee is **150 USDC**, locked in Arc escrow.\n\nFund the escrow and I'll launch within 2 hours.", time: 'May 11 · 2:01 PM' },
    { role: 'user',   text: "I'll fund it now.",                                                                                                                                                                                                                                       time: 'May 11 · 2:03 PM' },
    { role: 'system', text: 'Contract created · Awaiting escrow funding',                                                                                                                                                                                                              time: 'May 11 · 2:03 PM' },
  ],
  c3: [
    { role: 'user',         text: 'I need a brand awareness campaign for Q1. ROAS target 2.5× over 30 days, $1000 minimum spend.',                                                                                                                                                     time: 'Mar 29 · 10:00 AM' },
    { role: 'agent',        text: "30 days gives me enough room to properly optimize across multiple audience layers.\n\nI estimate **68% probability** of hitting ROAS ≥ 2.5×. Strategy: 1–3% lookalikes from your purchaser list + 14-day engaged visitor retargeting + dynamic product ads for cart abandoners.\n\nSuccess fee: **100 USDC** in Arc escrow.", time: 'Mar 29 · 10:01 AM' },
    { role: 'user',         text: "Let's do it.",                                                                                                                                                                                                                                      time: 'Mar 29 · 10:02 AM' },
    { role: 'system',       text: 'Contract created · Escrow funded · Campaign launched',                                                                                                                                                                                              time: 'Mar 29 · 10:05 AM' },
    { role: 'agent-update', text: 'Week 1: ROAS 1.80×. Lookalike audience performing well. Cart abandoner DPAs hitting 3.2× on their own.',                                                                                                                                           time: 'Apr 5 · 9:00 AM' },
    { role: 'agent-update', text: 'Week 2: ROAS 2.18×. Reallocated 60% of budget to the top ad set. Cart DPAs now driving 40% of all conversions.',                                                                                                                                   time: 'Apr 12 · 9:00 AM' },
    { role: 'agent-update', text: 'Week 3: ROAS 2.56×. Target already exceeded with a week remaining. Scaling to maximize the final result.',                                                                                                                                          time: 'Apr 19 · 9:00 AM' },
    { role: 'agent-update', text: 'Campaign complete. Final ROAS: 2.73× against your 2.5× target. 100 USDC success fee released. Great run.',                                                                                                                                          time: 'Apr 28 · 11:00 AM' },
    { role: 'system',       text: 'Contract settled · 100 USDC released to agent · Campaign closed',                                                                                                                                                                                   time: 'Apr 28 · 11:01 AM' },
  ],
  c4: [
    { role: 'user',         text: 'Flash sale this weekend. I need ROAS 3.0 in 3 days. Budget around $200.',                                                                                                                                                                           time: 'Apr 29 · 8:00 AM' },
    { role: 'agent',        text: "ROAS 3.0 in 3 days is high risk — **41% probability**. The short window limits optimization cycles.\n\nI'd suggest lowering the target to 2.5× (68% probability) or extending to 7 days (61% at 3.0×). How do you want to proceed?",               time: 'Apr 29 · 8:01 AM' },
    { role: 'user',         text: 'I understand the risk. Proceed with original terms.',                                                                                                                                                                                               time: 'Apr 29 · 8:02 AM' },
    { role: 'agent',        text: "Understood. Proceeding with ROAS ≥ 3.0 in 3 days at **41% probability**. I'll use flash sale countdown formats and target your highest-intent audiences from day one.\n\nSuccess fee: **80 USDC** in Arc escrow.",                                   time: 'Apr 29 · 8:02 AM' },
    { role: 'system',       text: 'Contract created · Escrow funded · Campaign launched',                                                                                                                                                                                              time: 'Apr 29 · 8:05 AM' },
    { role: 'agent-update', text: 'Day 1: ROAS 2.10×. Below trajectory for 3.0×. Shifted all budget to previous purchasers — your highest-intent segment.',                                                                                                                           time: 'Apr 30 · 8:00 AM' },
    { role: 'agent-update', text: "Day 2: ROAS 2.28×. I've exhausted the highest-intent segments. The gap to 3.0× is unlikely to close in 24 hours.",                                                                                                                                 time: 'May 1 · 8:00 AM' },
    { role: 'agent-update', text: 'Campaign ended. Final ROAS: 1.94×. Target of 3.0× was not met. 80 USDC has been refunded to your wallet per the escrow contract.',                                                                                                                  time: 'May 2 · 12:00 PM' },
    { role: 'system',       text: 'Contract closed · 80 USDC refunded to wallet',                                                                                                                                                                                                     time: 'May 2 · 12:01 PM' },
  ],
}

// ─── CHAT MESSAGE COMPONENTS ──────────────────────────────────────────────────
// Inline markdown — bold only (no full react-markdown dependency needed)
function SimpleText({ text }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/)
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('**') && p.endsWith('**')
          ? <strong key={i} style={{ fontWeight: 700 }}>{p.slice(2, -2)}</strong>
          : p.split('\n').map((line, j, arr) =>
              j < arr.length - 1 ? <React.Fragment key={`${i}-${j}`}>{line}<br /></React.Fragment> : <React.Fragment key={`${i}-${j}`}>{line}</React.Fragment>
            )
      )}
    </>
  )
}

function UserBubble({ msg }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'flex-start' }}>
      <div style={{ maxWidth: '76%', background: C.userBg, color: '#fff', padding: '11px 15px', borderRadius: '16px 16px 4px 16px', fontSize: '13px', lineHeight: 1.65, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', fontFamily: font }}>
        {msg.text}
      </div>
    </div>
  )
}

function AgentBubble({ msg }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-start', width: '100%' }}>
      <div style={{ width: '100%', fontSize: '13px', lineHeight: 1.65, color: C.text, fontFamily: font }}>
        <SimpleText text={msg.text} />
      </div>
    </div>
  )
}

function AgentUpdate({ msg }) {
  return (
    <div style={{ borderLeft: `3px solid ${C.indigo}`, background: C.indigoGlow, borderRadius: '0 8px 8px 0', padding: '10px 14px 10px 12px' }}>
      <div style={{ fontSize: '10px', fontWeight: 700, color: C.indigo, marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.07em', fontFamily: font }}>
        Agent update · {msg.time}
      </div>
      <div style={{ fontSize: '13px', color: C.sub, lineHeight: 1.65, fontFamily: font }}>{msg.text}</div>
    </div>
  )
}

function SystemEvent({ msg }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <div style={{ flex: 1, height: '1px', background: C.borderS }} />
      <span style={{ fontSize: '11px', color: C.faint, fontFamily: font, whiteSpace: 'nowrap' }}>{msg.text} · {msg.time}</span>
      <div style={{ flex: 1, height: '1px', background: C.borderS }} />
    </div>
  )
}

function ThinkingDots() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 0' }}>
      {[0, 1, 2].map(i => (
        <span key={i} style={{ display: 'inline-block', width: '7px', height: '7px', borderRadius: '50%', background: C.indigo, animation: 'agentDotBounce 1.1s ease-in-out infinite', animationDelay: `${i * 0.18}s` }} />
      ))}
    </div>
  )
}

// ─── RIGHT PANEL ATOMS ────────────────────────────────────────────────────────
function SectionRow({ num, title, subtitle, action }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 10px', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: C.indigo, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#fff', lineHeight: 1 }}>{num}</span>
        </div>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 700, color: C.text, lineHeight: 1.3, fontFamily: font }}>{title}</div>
          <div style={{ fontSize: '11px', color: C.muted, marginTop: '2px', fontFamily: font }}>{subtitle}</div>
        </div>
      </div>
      {action}
    </div>
  )
}

function InnerCard({ children, style = {} }) {
  return (
    <div style={{ margin: '0 12px 4px', background: 'var(--c-inner-card)', borderRadius: '10px', border: `1px solid var(--c-inner-border)`, overflow: 'hidden', ...style }}>
      {children}
    </div>
  )
}

function Bar({ value, max, color }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100))
  return (
    <div style={{ height: '4px', background: 'var(--c-bar-track)', borderRadius: '2px', overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: '2px' }} />
    </div>
  )
}

// ─── ROAS CHART (compact) ────────────────────────────────────────────────────
function RoasChart({ data, target, color }) {
  const W = 400, H = 72, pX = 6, pY = 8
  const vals = data.filter((_, i) => i > 0)
  if (vals.length < 2) return null
  const all  = [...vals, target]
  const min  = Math.min(...all) * 0.82
  const max  = Math.max(...all) * 1.14
  const rng  = max - min || 1
  const xi   = i => pX + (i / Math.max(vals.length - 1, 1)) * (W - pX * 2)
  const yi   = v => H - pY - ((v - min) / rng) * (H - pY * 2)
  const line = vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${xi(i).toFixed(1)},${yi(v).toFixed(1)}`).join(' ')
  const area = `${line} L${xi(vals.length - 1).toFixed(1)},${H} L${xi(0).toFixed(1)},${H} Z`
  const tY   = yi(target)
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible', display: 'block' }}>
      <defs>
        <linearGradient id="wsrg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity="0.2" />
          <stop offset="100%" stopColor={color} stopOpacity="0"   />
        </linearGradient>
      </defs>
      <line x1={pX} y1={tY} x2={W - pX} y2={tY} stroke={C.green} strokeWidth="1" strokeDasharray="4,3" opacity="0.7" />
      <path d={area} fill="url(#wsrg)" />
      <path d={line} stroke={color} strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={xi(vals.length - 1)} cy={yi(vals[vals.length - 1])} r="3" fill={color} stroke="#fff" strokeWidth="1.5" />
    </svg>
  )
}

// ─── STATUS SECTION CONTENT ───────────────────────────────────────────────────
function StatusContent({ c }) {
  if (c.status === 'active') {
    const roasPct   = Math.min(100, (c.currentRoas / c.targetRoas) * 100)
    const roasColor = roasPct >= 100 ? C.green : roasPct >= 80 ? C.amber : C.indigo
    return (
      <InnerCard>
        <div style={{ padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '4px' }}>
            <span style={{ fontSize: '36px', fontWeight: 800, color: roasColor, letterSpacing: '-0.04em', lineHeight: 1, fontFamily: font }}>
              {c.currentRoas.toFixed(2)}<span style={{ fontSize: '20px' }}>×</span>
            </span>
            <span style={{ fontSize: '12px', color: C.muted, fontFamily: font }}>of {c.targetRoas}× target</span>
            <span style={{ marginLeft: 'auto', fontSize: '18px', fontWeight: 800, color: c.prob >= 65 ? C.green : C.amber, fontFamily: font }}>{c.prob}%</span>
          </div>
          <div style={{ margin: '12px 0 10px' }}>
            <RoasChart data={c.roasHistory} target={c.targetRoas} color={roasColor} />
          </div>
          <Bar value={c.currentRoas} max={c.targetRoas} color={roasColor} />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '11px', color: C.faint, fontFamily: font }}>
            <span>{c.daysLeft} day{c.daysLeft !== 1 ? 's' : ''} left</span>
            <span>${c.spend.toLocaleString()} / ${c.minSpend.toLocaleString()} spend</span>
          </div>
        </div>
      </InnerCard>
    )
  }

  if (c.status === 'pending_funding') {
    return (
      <InnerCard>
        <div style={{ padding: '16px' }}>
          <p style={{ fontSize: '13px', color: C.sub, lineHeight: 1.65, margin: '0 0 14px', fontFamily: font }}>
            Fund the escrow to launch your campaign. The agent is ready — <strong style={{ fontWeight: 700 }}>{c.prob}% probability</strong> of hitting your target.
          </p>
          <button
            style={{ width: '100%', padding: '12px', borderRadius: '9px', border: 'none', background: C.indigo, color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: font, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px', transition: 'opacity 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.88'}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
          >
            Lock {c.fee} USDC in Escrow
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
          </button>
          <p style={{ fontSize: '11px', color: C.faint, textAlign: 'center', margin: '8px 0 0', fontFamily: font }}>Settlement enforced by Arc — not by OutcomeX.</p>
        </div>
      </InnerCard>
    )
  }

  const isSuccess  = c.status === 'success'
  const accentColor = isSuccess ? C.green : C.muted
  const txHash      = isSuccess ? c.settleTxHash : c.refundTxHash
  return (
    <InnerCard>
      <div style={{ padding: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: isSuccess ? C.greenBg : C.bg, borderRadius: '8px', border: `1px solid ${isSuccess ? C.greenBorder : C.border}`, marginBottom: '14px' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: isSuccess ? C.greenLight : 'var(--c-bar-track)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {isSuccess
              ? <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              : <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            }
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '26px', fontWeight: 800, color: accentColor, letterSpacing: '-0.04em', lineHeight: 1, fontFamily: font }}>{c.finalRoas}×</div>
            <div style={{ fontSize: '11px', color: C.muted, marginTop: '2px', fontFamily: font }}>target was {c.targetRoas}×</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '15px', fontWeight: 700, color: isSuccess ? C.green : C.sub, fontFamily: font }}>{c.fee} USDC</div>
            <div style={{ fontSize: '11px', color: C.faint, fontFamily: font }}>{isSuccess ? 'released' : 'refunded'}</div>
          </div>
        </div>
        {c.roasHistory && c.roasHistory.length > 2 && (
          <div style={{ marginBottom: '10px' }}>
            <RoasChart data={c.roasHistory} target={c.targetRoas} color={accentColor} />
          </div>
        )}
        {txHash && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontFamily: font }}>
            <span style={{ color: C.faint }}>Settlement tx</span>
            <span style={{ color: C.indigo, fontWeight: 600 }}>{txHash}</span>
          </div>
        )}
      </div>
    </InnerCard>
  )
}

// ─── LIFECYCLE SECTION ────────────────────────────────────────────────────────
function LifecycleContent({ stages }) {
  return (
    <InnerCard>
      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column' }}>
        {stages.map((s, i) => {
          const isDone    = s.state === 'done'
          const isCurrent = s.state === 'current'
          const isLast    = i === stages.length - 1
          const dotColor  = isDone ? C.indigo : isCurrent ? C.amber : C.faint
          return (
            <div key={i} style={{ display: 'flex', gap: '12px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                <div style={{ width: '9px', height: '9px', borderRadius: '50%', background: isDone || isCurrent ? dotColor : 'transparent', border: `2px solid ${dotColor}`, flexShrink: 0, animation: isCurrent ? 'agentThinkPulse 1.5s ease-in-out infinite' : 'none' }} />
                {!isLast && <div style={{ width: '2px', flex: 1, minHeight: '14px', background: isDone ? C.indigo : '#e8e7f2', margin: '2px 0', borderRadius: '1px', opacity: isDone ? 1 : 0.3 }} />}
              </div>
              <div style={{ paddingBottom: isLast ? '0' : '12px', flex: 1 }}>
                <div style={{ fontSize: '12px', fontWeight: isDone || isCurrent ? 600 : 400, color: isDone || isCurrent ? C.sub : C.faint, fontFamily: font }}>{s.label}</div>
                {s.note && <div style={{ fontSize: '11px', color: C.faint, fontFamily: font, marginTop: '2px', lineHeight: 1.5 }}>{s.note}</div>}
              </div>
            </div>
          )
        })}
      </div>
    </InnerCard>
  )
}

// ─── STRATEGY & TERMS SECTION ─────────────────────────────────────────────────
function StrategyTermsContent({ c }) {
  const rows = [
    ['Target',    `ROAS ≥ ${c.targetRoas}×`],
    ['Min spend', `$${c.minSpend.toLocaleString()}`],
    ['Window',    `${c.windowDays} days`],
    ['Fee',       `${c.fee} USDC`],
  ]
  return (
    <>
      {/* Terms */}
      <InnerCard style={{ marginBottom: '8px' }}>
        <div style={{ padding: '4px 0 4px' }}>
          {rows.map(([k, v], i, arr) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 14px', borderBottom: i < arr.length - 1 ? `1px solid var(--c-panel-bg)` : 'none' }}>
              <span style={{ fontSize: '12px', color: C.muted, fontFamily: font }}>{k}</span>
              <span style={{ fontSize: '12px', fontWeight: 600, color: C.sub, fontFamily: font }}>{v}</span>
            </div>
          ))}
        </div>
      </InnerCard>

      {/* Strategy */}
      {c.strategy && (
        <InnerCard>
          <div style={{ padding: '12px 14px' }}>
            <p style={{ fontSize: '12px', color: C.sub, lineHeight: 1.7, margin: '0 0 10px', fontFamily: font }}>{c.strategy.summary}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
              {c.strategy.actions.map((a, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                  <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: a.done ? '#f0fdf4' : `${C.indigo}10`, border: `1.5px solid ${a.done ? C.green : C.faint}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '1px' }}>
                    {a.done
                      ? <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
                      : <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: C.faint }} />
                    }
                  </div>
                  <span style={{ fontSize: '12px', color: a.done ? C.sub : C.muted, fontFamily: font, lineHeight: 1.5 }}>{a.text}</span>
                </div>
              ))}
            </div>
          </div>
        </InnerCard>
      )}
    </>
  )
}

// ─── PAGE ─────────────────────────────────────────────────────────────────────
export default function WorkspacePage() {
  const { id } = useParams()
  const openMobileSidebar = useOpenMobileSidebar()
  const [messages, setMessages] = React.useState([])
  const [thinking, setThinking] = React.useState(false)
  const [inputAreaHeight, setInputAreaHeight] = React.useState(120)

  const scrollRef       = React.useRef(null)
  const desktopInputRef = React.useRef(null)
  const mobileInputRef  = React.useRef(null)
  const inputKey        = React.useRef(0)

  const c = ALL[id]

  React.useEffect(() => { setMessages(CHATS[id] || []) }, [id])

  // Track input bar height to pad the message scroll area
  React.useEffect(() => {
    const update = () => {
      const mH = mobileInputRef.current?.offsetHeight || 0
      const dH = desktopInputRef.current?.offsetHeight || 0
      const h = Math.max(mH, dH)
      if (h > 0) setInputAreaHeight(h)
    }
    const ro = new ResizeObserver(update)
    if (mobileInputRef.current)  ro.observe(mobileInputRef.current)
    if (desktopInputRef.current) ro.observe(desktopInputRef.current)
    update()
    return () => ro.disconnect()
  }, [])

  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, thinking])

  function handleSend(text) {
    setMessages(prev => [...prev, { role: 'user', text, time: 'Just now' }])
    setThinking(true)
    setTimeout(() => {
      setThinking(false)
      setMessages(prev => [...prev, {
        role: 'agent',
        text: "Got it. I'm actively monitoring the campaign and will send you an update as soon as there's a meaningful change.",
        time: 'Just now',
      }])
    }, 1400)
  }

  if (!c) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg }}>
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: '14px', color: C.muted, fontFamily: font, marginBottom: '12px' }}>Workspace not found.</p>
        <Link href="/contracts" style={{ fontSize: '13px', color: C.indigo, fontWeight: 600, textDecoration: 'none', fontFamily: font }}>← Back to My Contracts</Link>
      </div>
    </div>
  )

  const stages     = buildStages(c)
  const badge      = STATUS_COLORS[c.status] || STATUS_COLORS.failure
  const badgeLabel = STATUS_LABEL[c.status]  || c.status
  const isResolved = c.status === 'success' || c.status === 'failure'

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Mobile header */}
      <div className="app-mobile-header">
        <button onClick={openMobileSidebar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.text, padding: '4px', display: 'flex', marginRight: '12px' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18" /><path d="M13 9l3 3-3 3" /></svg>
        </button>
        <span style={{ fontSize: '15px', fontWeight: 700, color: C.text, flex: 1, fontFamily: font }}>Workspace</span>
      </div>

      {/* Split body — no shared top bar, each panel owns its header */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── LEFT: Chat panel ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: C.surface, position: 'relative', minWidth: 0 }}>

          {/* Scrollable message list */}
          <div
            ref={scrollRef}
            className="agent-msgs-area"
            style={{ flex: 1, overflowY: 'auto', overflowAnchor: 'none', paddingTop: '24px', paddingBottom: `${inputAreaHeight + 16}px` }}
          >
            {messages.map((msg, i) => (
              <div key={i} style={{ maxWidth: '720px', margin: '0 auto', width: '100%', padding: '0 20px 16px' }}>
                {msg.role === 'user'         && <UserBubble  msg={msg} />}
                {msg.role === 'agent'        && <AgentBubble msg={msg} />}
                {msg.role === 'agent-update' && <AgentUpdate msg={msg} />}
                {msg.role === 'system'       && <SystemEvent msg={msg} />}
              </div>
            ))}

            {thinking && (
              <div style={{ maxWidth: '720px', margin: '0 auto', width: '100%', padding: '0 20px 16px' }}>
                <ThinkingDots />
              </div>
            )}
          </div>

          {/* Mobile input — fixed at bottom */}
          <div ref={mobileInputRef} className="agent-input-mobile" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '32px 14px 20px', background: 'linear-gradient(to bottom, transparent, var(--c-surface) 35%)' }}>
            <AgentInputBar
              key={`m-${inputKey.current}`}
              onSend={handleSend}
              chatReady={!isResolved && !thinking}
              loading={thinking}
              placeholder={isResolved ? 'Contract resolved — read-only' : 'Ask the agent anything…'}
              fontSize="16px"
              paddingLeft="16px"
            />
          </div>

          {/* Desktop input — absolute at bottom with gradient */}
          <div ref={desktopInputRef} className="agent-input-desktop" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '40px 40px 16px', background: 'linear-gradient(to bottom, transparent, var(--c-surface) 35%)' }}>
            <div style={{ maxWidth: '720px', margin: '0 auto' }}>
              <AgentInputBar
                key={`d-${inputKey.current}`}
                onSend={handleSend}
                chatReady={!isResolved && !thinking}
                loading={thinking}
                placeholder={isResolved ? 'Contract resolved — read-only' : 'Ask the agent or send an update…'}
                fontSize="13px"
                paddingLeft="18px"
              />
            </div>
            <div style={{ fontSize: '11px', color: C.muted, marginTop: '8px', textAlign: 'center', fontFamily: font }}>Enter to send · Shift+Enter for new line</div>
          </div>
        </div>

        {/* ── RIGHT: Contract detail panel (Sanluna-style) ── */}
        <div style={{ width: '420px', flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: C.surface, padding: '8px 8px 8px 0' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRadius: '12px', background: 'var(--c-panel-bg)' }}>

            {/* Panel header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', flexShrink: 0, gap: '8px', borderBottom: '1px solid var(--c-inner-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: C.text, fontFamily: font, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                <span style={{ fontSize: '10px', fontWeight: 700, color: badge.color, background: badge.bg, padding: '2px 8px', borderRadius: '20px', whiteSpace: 'nowrap', flexShrink: 0 }}>{badgeLabel}</span>
              </div>
              <Link
                href={`/contracts/${c.id}`}
                style={{ fontSize: '11px', fontWeight: 600, color: C.muted, background: 'none', border: `1px solid var(--c-border)`, borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontFamily: font, whiteSpace: 'nowrap', textDecoration: 'none', flexShrink: 0, transition: 'color 0.15s, border-color 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.color = C.indigo; e.currentTarget.style.borderColor = C.indigo }}
                onMouseLeave={e => { e.currentTarget.style.color = C.muted;  e.currentTarget.style.borderColor = 'var(--c-border)' }}
              >
                Full detail →
              </Link>
            </div>

            {/* Scrollable sections */}
            <div style={{ flex: 1, overflowY: 'auto', paddingBottom: '12px' }}>

              {/* Section 1: Performance */}
              <SectionRow
                num={1}
                title={c.status === 'active' ? 'Live Performance' : c.status === 'pending_funding' ? 'Fund Escrow' : 'Outcome'}
                subtitle={c.status === 'active' ? 'Real-time ROAS and spend tracking' : c.status === 'pending_funding' ? 'Lock funds to launch the campaign' : c.status === 'success' ? 'Contract settled — target met' : 'Contract closed — target missed'}
              />
              <StatusContent c={c} />

              {/* Section 2: Lifecycle */}
              <SectionRow num={2} title="Lifecycle" subtitle="Contract stages and milestones" />
              <LifecycleContent stages={stages} />

              {/* Section 3: Strategy & Terms */}
              <SectionRow num={3} title="Strategy & Terms" subtitle="Contract parameters and agent plan" />
              <StrategyTermsContent c={c} />

            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
