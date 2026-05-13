'use client'
import React from 'react'
import Link from 'next/link'
import { useOpenMobileSidebar } from '@/components/AppShell'

const C = {
  bg:        'var(--c-bg)',
  surface:   'var(--c-surface)',
  surfaceAlt:'var(--c-surface-alt)',
  border:    'var(--c-border)',
  text:      'var(--c-text)',
  muted:     'var(--c-muted)',
  sub:       'var(--c-sub)',
  indigo:    'var(--c-indigo)',
  indigoMid: 'var(--c-indigo-mid)',
  green:     'var(--c-green)',
  amber:     'var(--c-amber)',
  red:       'var(--c-red)',
}

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

// ─── STATUS BADGE ─────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const map = {
    active:   { label: 'Active',   color: C.indigo, bg: 'var(--c-indigo-bg)' },
    funded:   { label: 'Funded',   color: C.amber,  bg: 'var(--c-amber-bg)'  },
    created:  { label: 'Pending',  color: C.muted,  bg: C.surfaceAlt         },
    success:  { label: 'Success',  color: C.green,  bg: 'var(--c-green-bg)'  },
    failure:  { label: 'Refunded', color: C.red,    bg: 'var(--c-red-bg)'    },
    settled:  { label: 'Settled',  color: C.green,  bg: 'var(--c-green-bg)'  },
  }
  const s = map[status] || map.created
  return (
    <span style={{ fontSize: '10px', fontWeight: 700, color: s.color, background: s.bg, padding: '3px 8px', borderRadius: '20px', whiteSpace: 'nowrap' }}>
      {s.label}
    </span>
  )
}

// ─── SPARKLINE ────────────────────────────────────────────────────────────────
function Sparkline({ points, color }) {
  const W = 72, H = 32, pad = 3
  if (!points || points.length < 2) return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ flexShrink: 0 }}>
      <line x1={pad} y1={H/2} x2={W-pad} y2={H/2} stroke={C.border} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
  const min = Math.min(...points), max = Math.max(...points)
  const range = max - min || 1
  const xs = points.map((_, i) => pad + (i / (points.length - 1)) * (W - pad * 2))
  const ys = points.map(v => H - pad - ((v - min) / range) * (H - pad * 2))
  const line = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ')
  const area = `${line} L${(W-pad).toFixed(1)},${H} L${pad},${H} Z`
  const gid = `sg-${Math.random().toString(36).slice(2)}`
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ flexShrink: 0 }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.2" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} stroke={color} strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ─── KPI STRIP ────────────────────────────────────────────────────────────────
const MOCK_KPIS = [
  { label: 'Active Contracts', value: '2', sub: '1 on track, 1 at risk', sparkline: [1, 1, 2, 2, 3, 3, 2, 2], color: C.indigo },
  { label: 'USDC in Escrow',   value: '$200',  sub: 'across all contracts',  sparkline: [100, 100, 200, 200, 200, 200, 200, 200], color: C.amber },
  { label: 'Avg. Success Prob', value: '64%', sub: 'live ML estimate',      sparkline: [70, 68, 65, 64, 62, 64, 65, 64], color: C.green },
  { label: 'Settled (lifetime)', value: '1',  sub: '100 USDC earned by agent', sparkline: [0, 0, 0, 1, 1, 1, 1, 1], color: C.indigoMid },
]

function KpiStrip() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' }}>
      {MOCK_KPIS.map(tile => (
        <div key={tile.label} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '12px', padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: '11px', color: C.muted, fontWeight: 500, marginBottom: '6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tile.label}</div>
              <div style={{ fontSize: '22px', fontWeight: 800, color: C.text, letterSpacing: '-0.03em', lineHeight: 1, marginBottom: '5px' }}>{tile.value}</div>
              <span style={{ fontSize: '10px', color: C.muted }}>{tile.sub}</span>
            </div>
            <Sparkline points={tile.sparkline} color={tile.color} />
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── AGENT CARD ───────────────────────────────────────────────────────────────
function AgentCard() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.55fr 1fr', gap: '12px', marginBottom: '12px' }}>
      {/* Underwriting Agent */}
      <Link href="/contracts/new" style={{
        display: 'flex', flexDirection: 'column', textDecoration: 'none',
        background: 'linear-gradient(135deg, #2e2a7a 0%, #1e1a5e 50%, #0f0d2e 100%)',
        border: '1px solid #3730a3',
        borderRadius: '16px', padding: '24px 28px',
        position: 'relative', overflow: 'hidden',
        boxShadow: '0 2px 12px rgba(79,70,229,0.15)',
      }}>
        <div style={{ position: 'absolute', right: '20px', top: '20px', width: '52px', height: '52px', borderRadius: '14px', background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#a5b4fc" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <circle cx="12" cy="12" r="5"/>
            <circle cx="12" cy="12" r="1.5" fill="#a5b4fc" stroke="none"/>
          </svg>
        </div>
        <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#fff', margin: '0 0 4px', letterSpacing: '-0.025em', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Underwriting Agent</h2>
        <p style={{ fontSize: '12px', color: '#a5b4fc', margin: '0 0 10px', fontWeight: 500 }}>Performance Contract Evaluator</p>
        <p style={{ fontSize: '12px', color: '#c7d2fe', lineHeight: 1.7, margin: '0 0 20px', maxWidth: '320px', flex: 1 }}>
          Submit your ROAS target and campaign parameters. The agent estimates success probability and either accepts, counteroffers, or declines.
        </p>
        <div style={{ marginTop: 'auto' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: C.indigo, color: '#fff', fontSize: '12px', fontWeight: 600, padding: '8px 18px', borderRadius: '8px' }}>
            Create new contract
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </span>
        </div>
      </Link>

      {/* Execution Agent */}
      <div style={{
        display: 'flex', flexDirection: 'column',
        background: C.surface, border: `1px solid ${C.border}`,
        borderRadius: '16px', padding: '24px 24px',
        boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', right: '20px', top: '20px', width: '36px', height: '36px', borderRadius: '8px', background: C.surfaceAlt, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>
            <polyline points="16 7 22 7 22 13"/>
          </svg>
        </div>
        <h2 style={{ fontSize: '20px', fontWeight: 800, color: C.text, margin: '0 0 4px', letterSpacing: '-0.025em', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Execution Agent</h2>
        <p style={{ fontSize: '12px', color: C.sub, margin: '0 0 10px', fontWeight: 500 }}>Meta Ads & Strategy Runner</p>
        <p style={{ fontSize: '12px', color: C.muted, lineHeight: 1.7, margin: '0 0 20px', flex: 1 }}>
          After you approve the strategy, this agent runs the Meta Ads campaign and continuously optimizes toward your contracted ROAS target.
        </p>
        <div style={{ marginTop: 'auto' }}>
          <Link href="/contracts" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'transparent', color: C.text, fontSize: '12px', fontWeight: 600, padding: '7px 18px', borderRadius: '8px', border: `1px solid ${C.border}`, textDecoration: 'none' }}>
            View active contracts
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </Link>
        </div>
      </div>
    </div>
  )
}

// ─── DEMO GOLDEN PATH ─────────────────────────────────────────────────────────
const DEMO_CONTRACTS = [
  {
    id: 'c1',
    campaign: 'Summer ROAS Campaign — Retargeting',
    target: 'ROAS ≥ 2.0×',
    status: 'active',
    roas: 1.86,
    targetRoas: 2.0,
    spend: '$318',
    daysLeft: 3,
    prob: 61,
    fee: '100 USDC',
  },
  {
    id: 'c2',
    campaign: 'Brand Awareness — Warm Audiences',
    target: 'ROAS ≥ 2.0×',
    status: 'settled',
    roas: 2.25,
    targetRoas: 2.0,
    spend: '$545',
    daysLeft: 0,
    prob: 100,
    fee: '100 USDC',
    txHash: '0xabc123...def456',
  },
  {
    id: 'c3',
    campaign: 'Q3 Performance Contract',
    target: 'ROAS ≥ 2.5×',
    status: 'funded',
    roas: null,
    targetRoas: 2.5,
    spend: '—',
    daysLeft: 7,
    prob: 68,
    fee: '150 USDC',
  },
]

function ContractRow({ contract }) {
  const roasOk = contract.roas && contract.roas >= contract.targetRoas
  return (
    <Link
      href={`/contracts/${contract.id}`}
      style={{
        display: 'flex', alignItems: 'center', gap: '16px', padding: '12px 16px',
        borderBottom: `1px solid ${C.border}`, textDecoration: 'none',
        transition: 'background 0.12s', cursor: 'pointer',
      }}
      onMouseEnter={e => e.currentTarget.style.background = C.surfaceAlt}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      {/* Campaign name */}
      <div style={{ flex: 2, minWidth: 0 }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{contract.campaign}</div>
        <div style={{ fontSize: '11px', color: C.muted, marginTop: '2px' }}>{contract.target} · {contract.fee}</div>
      </div>

      {/* ROAS */}
      <div style={{ minWidth: '70px', textAlign: 'right' }}>
        {contract.roas != null ? (
          <>
            <div style={{ fontSize: '14px', fontWeight: 700, color: roasOk ? C.green : C.amber }}>{contract.roas.toFixed(2)}×</div>
            <div style={{ fontSize: '10px', color: C.muted }}>target {contract.targetRoas}×</div>
          </>
        ) : (
          <div style={{ fontSize: '12px', color: C.muted }}>—</div>
        )}
      </div>

      {/* Prob */}
      <div style={{ minWidth: '60px', textAlign: 'right' }}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: contract.prob >= 70 ? C.green : contract.prob >= 50 ? C.amber : C.red }}>{contract.prob}%</div>
        <div style={{ fontSize: '10px', color: C.muted }}>success</div>
      </div>

      {/* Days / spend */}
      <div style={{ minWidth: '64px', textAlign: 'right' }}>
        <div style={{ fontSize: '12px', fontWeight: 600, color: C.text }}>{contract.spend}</div>
        <div style={{ fontSize: '10px', color: C.muted }}>{contract.daysLeft > 0 ? `${contract.daysLeft}d left` : 'Closed'}</div>
      </div>

      {/* Status */}
      <div style={{ flexShrink: 0 }}>
        <StatusBadge status={contract.status} />
      </div>

      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}><path d="M5 12h14M12 5l7 7-7 7"/></svg>
    </Link>
  )
}

function RecentContracts() {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '14px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: `1px solid ${C.border}` }}>
        <span style={{ fontSize: '13px', fontWeight: 700, color: C.text, fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Recent Contracts</span>
        <Link href="/contracts" style={{ fontSize: '11px', fontWeight: 600, color: C.indigo, textDecoration: 'none' }}>View all →</Link>
      </div>

      {/* Table header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '8px 16px', borderBottom: `1px solid ${C.border}`, background: C.surfaceAlt }}>
        <div style={{ flex: 2, fontSize: '10px', fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Campaign</div>
        <div style={{ minWidth: '70px', textAlign: 'right', fontSize: '10px', fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em' }}>ROAS</div>
        <div style={{ minWidth: '60px', textAlign: 'right', fontSize: '10px', fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Prob.</div>
        <div style={{ minWidth: '64px', textAlign: 'right', fontSize: '10px', fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Spend</div>
        <div style={{ flexShrink: 0, fontSize: '10px', fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Status</div>
        <div style={{ width: '13px' }} />
      </div>

      {DEMO_CONTRACTS.map(c => <ContractRow key={c.id} contract={c} />)}
    </div>
  )
}

// ─── QUICK LINKS ─────────────────────────────────────────────────────────────
const QUICK_LINKS = [
  {
    href: '/contracts/new',
    label: 'New Contract',
    sub: 'Define ROAS target, fee, and time window',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>,
  },
  {
    href: '/contracts',
    label: 'My Contracts',
    sub: 'View all active and past contracts',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  },
  {
    href: '/settings',
    label: 'Settings',
    sub: 'Wallet, notifications, and API keys',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>,
  },
]

// ─── PAGE ─────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const openMobileSidebar = useOpenMobileSidebar()
  const [isMobile, setIsMobile] = React.useState(false)

  React.useLayoutEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: C.bg }}>

      {/* Mobile header */}
      <div className="app-mobile-header">
        <button onClick={openMobileSidebar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.text, padding: '4px', display: 'flex', alignItems: 'center', marginRight: '12px' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/><path d="M13 9l3 3-3 3"/></svg>
        </button>
        <span style={{ fontSize: '15px', fontWeight: 700, color: C.text, flex: 1 }}>Home</span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '24px 24px 40px' }}>

          {/* ── Greeting ── */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', gap: '12px', flexWrap: 'wrap' }}>
            <div>
              <h1 style={{ fontSize: '22px', fontWeight: 800, color: C.text, letterSpacing: '-0.03em', margin: '0 0 2px', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                {greeting()}
              </h1>
              <p style={{ fontSize: '12px', color: C.muted, margin: 0 }}>Here's the status of your performance contracts.</p>
            </div>
            <Link href="/contracts/new" style={{
              display: 'inline-flex', alignItems: 'center', gap: '7px',
              background: C.indigo, color: '#fff', fontSize: '12px', fontWeight: 700,
              padding: '9px 18px', borderRadius: '8px', textDecoration: 'none',
              transition: 'opacity 0.15s', flexShrink: 0,
            }}
              onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
              onMouseLeave={e => e.currentTarget.style.opacity = '1'}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              New contract
            </Link>
          </div>

          {/* ── Agent cards ── */}
          {!isMobile && <AgentCard />}

          {/* ── KPI strip ── */}
          <div style={{ marginBottom: '12px' }}>
            <KpiStrip />
          </div>

          {/* ── Bottom: Contracts + Quick Access ── */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.8fr 1fr', gap: '12px' }}>

            {/* Recent Contracts */}
            <RecentContracts />

            {/* Quick Access */}
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '14px', padding: '16px 18px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: C.text, marginBottom: '12px', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Quick access</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {QUICK_LINKS.map(link => (
                  <Link key={link.href} href={link.href}
                    style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '9px 8px', borderRadius: '9px', textDecoration: 'none', transition: 'background 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.background = C.surfaceAlt}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: C.surfaceAlt, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{link.icon}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: C.text }}>{link.label}</div>
                      <div style={{ fontSize: '11px', color: C.muted, marginTop: '1px' }}>{link.sub}</div>
                    </div>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                  </Link>
                ))}
              </div>

              {/* Demo notice */}
              <div style={{ marginTop: '16px', padding: '12px', background: 'var(--c-indigo-subtle)', border: '1px solid var(--c-indigo-border)', borderRadius: '10px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: C.indigo, marginBottom: '4px' }}>Demo mode</div>
                <p style={{ fontSize: '11px', color: 'var(--c-indigo-mid)', lineHeight: 1.6, margin: 0 }}>
                  Contract data is mocked. Connect backend API endpoints to see live data.
                </p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
