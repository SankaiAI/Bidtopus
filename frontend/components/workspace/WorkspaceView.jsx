'use client'
import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useAuth } from '@clerk/nextjs'
import AgentInputBar from '@/components/AgentInputBar'
import EscrowFundButton from '@/components/EscrowFundButton'
import AcceptOfferCard from '@/components/AcceptOfferCard'
import TxHashLink, { isValidTxHash, truncateHash } from '@/components/TxHashLink'
import { useMessages } from '@/hooks/useMessages'
import { useActionApprovals } from '@/hooks/useActionApprovals'
import { getSession, upsertSession, generateSessionId } from '@/lib/workspaceSessions'
import { createApiClient } from '@/lib/api'
import { normalizeStatus, isAwaitingFund, isLive, isResolved, isNegotiating, canFund, awaitingOfferAcceptance } from '@/lib/contractStatus'
import ThinkingBlock from './ThinkingBlock'
import WorkspaceHeader from './WorkspaceHeader'
import { C, font } from './constants'

// ─── MARKDOWN ─────────────────────────────────────────────────────────────────
// Wrap every text node in word-spans so streaming text can fade in per-token.
// During streaming, the parent has `.agent-stream-text` which fires the
// per-word animation. React reconciles spans by key (position-based), so
// previously-rendered words keep their mount and don't re-animate — only
// freshly-appended tokens fire the fade-in.
function W({ children }) {
  // children is what ReactMarkdown passes — usually a string or an array
  // mixing strings with inline elements (<strong>, <em>, etc.).
  const arr = Array.isArray(children) ? children : [children]
  const out = []
  let k = 0
  for (const child of arr) {
    if (typeof child === 'string') {
      const tokens = child.split(/(\s+)/)  // split keeps whitespace as separate items
      for (const t of tokens) {
        if (t === '') continue
        out.push(<span key={k++} className="agent-word">{t}</span>)
      }
    } else if (React.isValidElement(child)) {
      // For inline elements like <strong>, render as a single animated span
      out.push(<span key={k++} className="agent-word">{child}</span>)
    } else if (child != null) {
      out.push(<span key={k++} className="agent-word">{child}</span>)
    }
  }
  return out
}
const MD = {
  html:   () => null,
  p:      ({ children }) => <p style={{ margin: '0 0 8px' }}><W>{children}</W></p>,
  ul:     ({ children }) => <ul style={{ margin: '4px 0 8px', paddingLeft: '18px' }}>{children}</ul>,
  ol:     ({ children }) => <ol style={{ margin: '4px 0 8px', paddingLeft: '18px' }}>{children}</ol>,
  li:     ({ children }) => <li style={{ marginBottom: '3px' }}><W>{children}</W></li>,
  strong: ({ children }) => <strong style={{ fontWeight: 700 }}>{children}</strong>,
  hr:     () => <hr style={{ border: 'none', borderTop: `1px solid ${C.border}`, margin: '10px 0' }} />,
  h3:     ({ children }) => <p style={{ margin: '0 0 6px', fontWeight: 700 }}><W>{children}</W></p>,
  code:   ({ inline, children }) => inline
    ? <code style={{ background: C.surfaceAlt, padding: '1px 5px', borderRadius: '4px', fontSize: '12px', fontFamily: 'monospace' }}>{children}</code>
    : <pre style={{ background: C.surfaceAlt, padding: '10px 12px', borderRadius: '8px', overflowX: 'auto', fontSize: '12px', margin: '6px 0' }}><code>{children}</code></pre>,
  // Table: no thead background (was creating a perceived top edge), no
  // bottom border on the last row (a CSS rule in globals.css strips it).
  // Internal separators kept: borderBottom under the header row + between
  // each data row. The `chat-md-table` class is the hook for the
  // last-row :last-child rule.
  table:  ({ children }) => <div style={{ overflowX: 'auto', margin: '10px 0' }}><table className="chat-md-table" style={{ borderCollapse: 'collapse', width: '100%', fontSize: '12px' }}>{children}</table></div>,
  thead:  ({ children }) => <thead>{children}</thead>,
  th:     ({ children }) => <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 700, color: C.sub, borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' }}>{children}</th>,
  td:     ({ children }) => <td style={{ padding: '6px 10px', borderBottom: `1px solid ${C.border}`, color: C.sub, verticalAlign: 'top' }}>{children}</td>,
}

// ─── MESSAGE COMPONENTS ───────────────────────────────────────────────────────
function UserBubble({ msg }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
      <div style={{ maxWidth: '78%', background: C.userBg, color: '#f0eff8', padding: '11px 15px', borderRadius: '16px 16px 4px 16px', fontSize: '13px', lineHeight: 1.65, fontFamily: font }}>{msg.text}</div>
    </div>
  )
}

function AgentBubble({ msg, streaming }) {
  // Streaming UX (Claude/ChatGPT style): each new word fades in via the
  // `.agent-stream-text .agent-word` animation in globals.css (the W helper
  // above wraps every token in a span). A blinking caret pinned to the end
  // signals active streaming. The timestamp is hidden mid-stream.
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
      <div style={{ width: 26, height: 26, borderRadius: 8, background: C.indigoBg, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '1px' }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.indigo} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>
      </div>
      <div
        className={streaming ? 'agent-stream-text' : undefined}
        style={{ flex: 1, fontSize: '13px', lineHeight: 1.65, color: C.text, fontFamily: font, paddingTop: '3px' }}
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD}>{msg.text || ''}</ReactMarkdown>
        {streaming
          ? <span className="agent-stream-caret" aria-hidden="true" />
          : <div style={{ fontSize: '11px', color: C.faint, marginTop: '6px' }}>{msg.time}</div>}
      </div>
    </div>
  )
}

function AgentUpdate({ msg }) {
  return (
    <div style={{ borderRadius: '12px', border: `1px solid ${C.indigoBorder}`, background: C.indigoGlow, overflow: 'hidden', fontFamily: font }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 14px', borderBottom: `1px solid ${C.indigoBorder}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: 22, height: 22, borderRadius: 6, background: C.indigo, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
          </div>
          <span style={{ fontSize: '11px', fontWeight: 700, color: C.indigo, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Agent Update{msg.metric?.day ? ` · Day ${msg.metric.day}` : ''}</span>
        </div>
        {msg.metric?.roas !== undefined && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ fontSize: '11px', color: C.muted, fontFamily: font }}>ROAS</span>
            <span style={{ fontSize: '14px', fontWeight: 800, color: C.indigo, fontFamily: font, letterSpacing: '-0.02em' }}>{msg.metric.roas}×</span>
          </div>
        )}
      </div>
      <div style={{ padding: '10px 14px 12px' }}>
        <div style={{ fontSize: '13px', color: C.sub, lineHeight: 1.65 }}>{msg.text}</div>
        <div style={{ fontSize: '11px', color: C.faint, marginTop: '7px' }}>{msg.time}</div>
      </div>
    </div>
  )
}

// Approval card: header row (icon + title + AWAITING badge) on top,
// buttons stacked below. Every card uses the same layout regardless of
// title length so the chat column has a predictable rhythm — short titles
// inline with the buttons looked visually inconsistent with multi-line ones.
// The previous render dumped extras as raw Python-dict text under the title;
// that was removed — the title already carries the full description.
function AgentActionCard({ msg, effectiveStatus, onApprove, error }) {
  const status     = effectiveStatus || msg.status || 'pending'
  const isPending  = status === 'pending'
  const isApproved = status === 'approved' || status === 'auto'
  const title      = msg.title || msg.text || ''
  // Status pill (AWAITING / Done / Auto-approved) intentionally omitted —
  // for pending cards the visible Approve / Request changes buttons already
  // signal "needs decision"; for resolved cards the footer line
  // "Approved · timestamp" carries the signal.
  // Ghost-at-rest, fill-on-hover. With 4+ approval cards stacked, solid indigo
  // buttons created a wall of purple that drowned out the actual content.
  // At rest the button is just indigo text + indigo border; on hover it fills
  // and the checkmark (stroke=currentColor) flips white automatically.
  const approveBtn = (
    <button
      onClick={onApprove}
      style={{
        padding: '8px 16px',
        background: 'transparent',
        color: C.indigo,
        border: `1px solid ${C.indigoBorder}`,
        borderRadius: '8px',
        fontSize: '12px',
        fontWeight: 600,
        cursor: 'pointer',
        fontFamily: font,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
        whiteSpace: 'nowrap',
        transition: 'background 0.15s, color 0.15s, border-color 0.15s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = C.indigo
        e.currentTarget.style.color = '#fff'
        e.currentTarget.style.borderColor = C.indigo
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'transparent'
        e.currentTarget.style.color = C.indigo
        e.currentTarget.style.borderColor = C.indigoBorder
      }}
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
      Approve
    </button>
  )
  const requestBtn = (
    <button style={{ padding: '8px 14px', background: 'transparent', color: C.muted, border: `1px solid ${C.border}`, borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: font, whiteSpace: 'nowrap', transition: 'color 0.15s, border-color 0.15s' }} onMouseEnter={e => { e.currentTarget.style.color = C.text; e.currentTarget.style.borderColor = C.muted }} onMouseLeave={e => { e.currentTarget.style.color = C.muted; e.currentTarget.style.borderColor = C.border }}>Request changes</button>
  )

  return (
    <div style={{ borderRadius: '12px', border: `1px solid ${isPending ? C.indigoBorder : C.border}`, background: C.surface, overflow: 'hidden', fontFamily: font }}>
      <div style={{ padding: '14px 16px 10px' }}>
        {/* Title weight 500 (was 700) — four bold cards in a row competed for
            attention. Medium reads as content, letting the (ghost) Approve
            button carry the primary affordance. */}
        <div style={{ fontSize: '13px', fontWeight: 500, color: isPending ? C.text : C.sub, lineHeight: 1.55 }}>{title}</div>
      </div>
      {isPending && (
        // Right-aligned button pair at natural content width. Approve no
        // longer fills the row — with stacked cards the full-width button
        // wasted horizontal space and visually overweighted the action
        // relative to the description.
        <div style={{ padding: '4px 14px 12px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          {approveBtn}
          {requestBtn}
        </div>
      )}
      {error && <div style={{ padding: '8px 14px 10px', display: 'flex', alignItems: 'center', gap: '7px' }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg><span style={{ fontSize: '11px', color: C.red, fontWeight: 500, fontFamily: font }}>{error}</span></div>}
      {isApproved && <div style={{ padding: '7px 14px 10px', display: 'flex', alignItems: 'center', gap: '6px' }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.faint} strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg><span style={{ fontSize: '11px', color: C.muted, fontWeight: 500 }}>{status === 'auto' ? 'Auto-approved' : 'Approved'}</span><span style={{ fontSize: '11px', color: C.faint }}>· {msg.approvedAt || msg.time}</span></div>}
    </div>
  )
}

// Strip dev-only annotations that the backend bakes into system event
// strings ("(MOCK)", "(dev mock, no on-chain tx)") so production merchants
// see the canonical message. Multiple parens variants and stray double-
// dashes get cleaned up too.
function cleanSystemText(text) {
  if (typeof text !== 'string') return ''
  return text
    .replace(/\s*\(\s*MOCK\s*\)/gi, '')
    .replace(/\s*\(\s*dev\s+mock[^)]*\)/gi, '')
    .replace(/\s*\(\s*no on-chain tx[^)]*\)/gi, '')
    .replace(/\s+—\s*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function SystemEvent({ msg }) {
  const text = cleanSystemText(msg.text)
  // No text → no divider. Otherwise we'd render a lonely "· timestamp" with
  // horizontal lines around it, which is pure visual noise between two real
  // messages that already carry their own timestamps.
  if (!text) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <div style={{ flex: 1, height: '1px', background: C.borderS }} />
      <span style={{ fontSize: '11px', color: C.faint, fontFamily: font, whiteSpace: 'nowrap' }}>{text} · {msg.time}</span>
      <div style={{ flex: 1, height: '1px', background: C.borderS }} />
    </div>
  )
}

function ThinkingDots() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <div style={{ width: 26, height: 26, borderRadius: 8, background: C.indigoBg, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.indigo} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>
      </div>
      <div style={{ display: 'flex', gap: '5px', paddingTop: '3px' }}>
        {[0, 1, 2].map(i => <span key={i} style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: C.indigo, animation: 'agentDotBounce 1.1s ease-in-out infinite', animationDelay: `${i * 0.18}s` }} />)}
      </div>
    </div>
  )
}

// ─── RIGHT PANEL ATOMS ────────────────────────────────────────────────────────
const STATUS_LABEL  = {
  negotiating:     'Negotiating',
  created:         'Ready to Fund',
  underwriting:    'Underwriting',
  offered:         'Reviewing Offer',
  pending_funding: 'Ready to Fund',
  funded:          'Funded',
  active:          'Active',
  settled:         'Settled',
  success:         'Success',
  failure:         'Refunded',
}
const STATUS_COLORS = {
  negotiating:     { color: C.indigo, bg: C.indigoBg },
  created:         { color: C.amber,  bg: C.amberBg  },
  underwriting:    { color: C.indigo, bg: C.indigoBg },
  offered:         { color: C.amber,  bg: C.amberBg  },
  pending_funding: { color: C.amber,  bg: C.amberBg  },
  funded:          { color: C.indigo, bg: C.indigoBg },
  active:          { color: C.indigo, bg: C.indigoBg },
  settled:         { color: C.green,  bg: C.greenBg  },
  success:         { color: C.green,  bg: C.greenBg  },
  failure:         { color: C.muted,  bg: C.bg       },
}

// Right-panel section header. `num` is accepted but ignored — numbered
// circles implied sequential steps, which doesn't match the meaning here
// (these sections are parallel, not ordered). Plain title + subtitle reads
// cleaner; the lifecycle inside still uses its own per-stage numbering where
// sequence actually matters.
function SectionRow({ title, subtitle }) {
  return (
    <div style={{ padding: '16px 16px 10px', flexShrink: 0 }}>
      <div style={{ fontSize: '11px', fontWeight: 700, color: C.muted, lineHeight: 1.3, fontFamily: font, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{title}</div>
      <div style={{ fontSize: '11px', color: C.faint, marginTop: '3px', fontFamily: font }}>{subtitle}</div>
    </div>
  )
}

function InnerCard({ children, style = {} }) {
  return <div style={{ margin: '0 12px 4px', background: 'var(--c-inner-card)', borderRadius: '10px', border: '1px solid var(--c-inner-border)', overflow: 'hidden', ...style }}>{children}</div>
}

function Bar({ value, max, color }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100))
  return <div style={{ height: '4px', background: 'var(--c-bar-track)', borderRadius: '2px', overflow: 'hidden' }}><div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: '2px' }} /></div>
}

function RoasChart({ data, target, color }) {
  const W = 400, H = 72, pX = 6, pY = 8
  const vals = data.filter((_, i) => i > 0)
  if (vals.length < 2) return null
  const all = [...vals, target], mn = Math.min(...all) * 0.82, mx = Math.max(...all) * 1.14, rng = mx - mn || 1
  const xi = i => pX + (i / Math.max(vals.length - 1, 1)) * (W - pX * 2)
  const yi = v => H - pY - ((v - mn) / rng) * (H - pY * 2)
  const line = vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${xi(i).toFixed(1)},${yi(v).toFixed(1)}`).join(' ')
  const area = `${line} L${xi(vals.length - 1).toFixed(1)},${H} L${xi(0).toFixed(1)},${H} Z`
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible', display: 'block' }}>
      <defs><linearGradient id="wsrg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.2"/><stop offset="100%" stopColor={color} stopOpacity="0"/></linearGradient></defs>
      <line x1={pX} y1={yi(target)} x2={W - pX} y2={yi(target)} stroke={C.green} strokeWidth="1" strokeDasharray="4,3" opacity="0.7"/>
      <path d={area} fill="url(#wsrg)"/>
      <path d={line} stroke={color} strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx={xi(vals.length - 1)} cy={yi(vals[vals.length - 1])} r="3" fill={color} stroke="#fff" strokeWidth="1.5"/>
    </svg>
  )
}

// Workspace version of the Live Performance card. Self-fetches the latest
// snapshot from /api/contracts/:id/performance so it never relies on mock
// `currentRoas`/`prob`/`roasHistory` fields that don't exist on real contracts.
// Mirrors LiveMonitor's empty-state behavior — never render a red ❌ for a
// freshly-funded contract that simply hasn't produced its first snapshot yet.
function _relMin(iso) {
  if (!iso) return null
  const diffMs = Date.now() - new Date(iso).getTime()
  if (Number.isNaN(diffMs) || diffMs < 0) return null
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} hr ago`
  return `${Math.floor(hrs / 24)} days ago`
}

function LivePerfPanel({ c }) {
  const { getToken, isLoaded, isSignedIn } = useAuth()
  const [perf, setPerf] = React.useState(null)
  const [loading, setLoading] = React.useState(true)
  const isRealContract = typeof c.id === 'string' && c.id.length >= 32

  React.useEffect(() => {
    if (!isRealContract || !isLoaded || !isSignedIn) { setLoading(false); return }
    let cancelled = false
    createApiClient(getToken).getPerformance(c.id)
      .then(p => { if (!cancelled) setPerf(p) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [c.id, isRealContract, isLoaded, isSignedIn, getToken])

  const hasSnapshot = perf && perf.timestamp != null && perf.roas != null
  const currentRoas = hasSnapshot ? perf.roas : null
  const currentSpend = perf?.spend ?? 0
  const updated = _relMin(perf?.timestamp)
  const prob = perf?.success_probability != null ? Math.round(perf.success_probability * 100) : null

  if (!hasSnapshot) {
    // Two distinct pre-data states. Funded = escrow locked but the merchant
    // hasn't approved the strategy yet, so nothing is running and "Awaiting
    // telemetry" would be misleading. Active = strategy approved, campaign
    // launched, first snapshot pending from the ~15 min ingest cycle.
    const isAwaitingApproval = c.status === 'funded'
    const headline = loading ? 'Checking for telemetry…'
      : isAwaitingApproval ? 'Approve the actions to launch'
      : 'Awaiting first telemetry'
    const subhead = isAwaitingApproval
      ? 'The campaign starts once you approve the strategy actions in the chat. First telemetry then arrives in about 15 min.'
      : 'Snapshots arrive about every 15 min once the campaign is live.'
    return (
      <InnerCard>
        <div style={{ padding: '20px 16px 18px', textAlign: 'center' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'var(--c-indigo-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px' }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={C.indigo} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <p style={{ fontSize: '13px', fontWeight: 600, color: C.sub, margin: '0 0 4px', fontFamily: font }}>{headline}</p>
          <p style={{ fontSize: '11px', color: C.muted, lineHeight: 1.55, margin: 0, fontFamily: font }}>{subhead}</p>
        </div>
        <div style={{ padding: '10px 16px 12px', borderTop: '1px solid var(--c-inner-border)', display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: C.faint, fontFamily: font }}>
          <span>Target <strong style={{ color: C.sub }}>ROAS ≥ {c.targetRoas}×</strong></span>
          <span>Min spend ${Number(c.minSpend || 0).toLocaleString()}</span>
        </div>
      </InnerCard>
    )
  }

  const pct = Math.min(100, (currentRoas / c.targetRoas) * 100)
  const color = pct >= 100 ? C.green : pct >= 80 ? C.amber : C.indigo

  return (
    <InnerCard>
      <div style={{ padding: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '4px' }}>
          <span style={{ fontSize: '36px', fontWeight: 800, color, letterSpacing: '-0.04em', lineHeight: 1, fontFamily: font }}>{currentRoas.toFixed(2)}<span style={{ fontSize: '20px' }}>×</span></span>
          <span style={{ fontSize: '12px', color: C.muted, fontFamily: font }}>of {c.targetRoas}× target</span>
          {prob != null && (
            <span style={{ marginLeft: 'auto', fontSize: '18px', fontWeight: 800, color: prob >= 65 ? C.green : C.amber, fontFamily: font }}>{prob}%</span>
          )}
        </div>
        <Bar value={currentRoas} max={c.targetRoas} color={color}/>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '11px', color: C.faint, fontFamily: font }}>
          <span>${currentSpend.toLocaleString()} / ${Number(c.minSpend || 0).toLocaleString()} spend</span>
          {updated && <span>Updated {updated}</span>}
        </div>
      </div>
    </InnerCard>
  )
}

function PanelContent({ c, refetchContract }) {
  const rows = [['Target', `ROAS ≥ ${c.targetRoas}×`], ['Min spend', `$${Number(c.minSpend || 0).toLocaleString()}`], ['Window', `${c.windowDays} days`], ['Fee', `${c.fee} USDC`]]

  const StatusSection = () => {
    if (isLive(c.status)) {
      return <LivePerfPanel c={c} />
    }
    if (awaitingOfferAcceptance(c.status)) {
      return (
        <InnerCard>
          <div style={{ padding: '16px' }}>
            <AcceptOfferCard contractId={c.id} onAccepted={refetchContract} />
          </div>
        </InnerCard>
      )
    }
    if (canFund(c.status)) {
      return (
        <InnerCard>
          <div style={{ padding: '16px' }}>
            <p style={{ fontSize: '13px', color: C.sub, lineHeight: 1.65, margin: '0 0 14px', fontFamily: font }}>Fund the escrow to launch your campaign.{c.prob != null && <> The agent is ready — <strong style={{ fontWeight: 700 }}>{c.prob}% probability</strong> of hitting your target.</>}</p>
            <EscrowFundButton contractId={c.id} feeUsdc={c.fee} termsLoaded={true} onFunded={refetchContract} />
          </div>
        </InnerCard>
      )
    }
    if (isAwaitingFund(c.status)) {
      // Created / Underwriting — agent is still working, no merchant action available yet.
      return (
        <InnerCard>
          <div style={{ padding: '16px' }}>
            <p style={{ fontSize: '13px', color: C.sub, lineHeight: 1.65, margin: 0, fontFamily: font }}>
              {c.status === 'underwriting'
                ? 'The agent is evaluating your contract. The offer will appear in chat shortly.'
                : c.status === 'offered'
                ? 'Contract accepted — preparing your escrow funding details.'
                : 'The agent is preparing your contract. Watch the chat for the next step.'}
            </p>
          </div>
        </InnerCard>
      )
    }
    // Resolved branch — distinguishes success / failure when frontend knows the outcome.
    // Plain `settled` (no outcome yet) shows a neutral "Resolved" state until the
    // backend exposes resolution_outcome on ContractResponse (see ticket).
    const isSuccess = c.status === 'success'
    const isFailure = c.status === 'failure'
    const outcomeKnown = isSuccess || isFailure
    const accent = isSuccess ? C.green : C.muted
    const txHash = isSuccess ? c.settleTxHash : c.refundTxHash
    return (
      <InnerCard>
        <div style={{ padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: isSuccess ? C.greenBg : C.bg, borderRadius: '8px', border: `1px solid ${isSuccess ? C.greenBorder : C.border}`, marginBottom: '14px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: isSuccess ? C.greenLight : 'var(--c-bar-track)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {isSuccess ? <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> : isFailure ? <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> : <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={C.indigo} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>}
            </div>
            <div style={{ flex: 1 }}>
              {outcomeKnown ? (
                <>
                  <div style={{ fontSize: '26px', fontWeight: 800, color: accent, letterSpacing: '-0.04em', lineHeight: 1, fontFamily: font }}>{c.finalRoas}×</div>
                  <div style={{ fontSize: '11px', color: C.muted, marginTop: '2px', fontFamily: font }}>target was {c.targetRoas}×</div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: C.sub, lineHeight: 1.3, fontFamily: font }}>Contract resolved</div>
                  <div style={{ fontSize: '11px', color: C.muted, marginTop: '2px', fontFamily: font }}>Settlement complete</div>
                </>
              )}
            </div>
            {outcomeKnown && (
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '15px', fontWeight: 700, color: isSuccess ? C.green : C.sub, fontFamily: font }}>{c.fee} USDC</div>
                <div style={{ fontSize: '11px', color: C.faint, fontFamily: font }}>{isSuccess ? 'released' : 'refunded'}</div>
              </div>
            )}
          </div>
          {c.roasHistory?.length > 2 && <div style={{ marginBottom: '10px' }}><RoasChart data={c.roasHistory} target={c.targetRoas} color={accent}/></div>}
          {txHash && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontFamily: font }}>
              <span style={{ color: C.faint }}>Settlement tx</span>
              {isValidTxHash(txHash)
                ? <TxHashLink hash={txHash} label={truncateHash(txHash)} style={{ color: C.indigo, fontWeight: 600, textDecoration: 'none' }} />
                : <span style={{ color: C.muted, fontWeight: 600 }}>{txHash}</span>}
            </div>
          )}
        </div>
      </InnerCard>
    )
  }

  function buildStages(c) {
    // Stage indices: 0 Contract created, 1 ML underwriting, 2 Agent decision,
    // 3 Escrow funded, 4 Campaign running, 5 Outcome resolved, 6 Settlement.
    // idx = the stage that is currently active (everything before is done).
    const idx = {
      created:         3, // mock convention: "just finalized, awaiting fund"
      underwriting:    2,
      offered:         3,
      pending_funding: 3,
      funded:          4,
      active:          4,
      settled:         7,
      success:         7,
      failure:         7,
    }[c.status] ?? 0
    const note = c.prob != null && c.expectedRange != null ? `${c.prob}% probability · ${c.risk} risk · expected ${c.expectedRange[0]}–${c.expectedRange[1]}×` : null
    const raw = [
      { label: 'Contract created', note: c.createdAt },
      { label: 'ML underwriting', note },
      { label: c.agentDecision === 'counteroffer' ? 'Agent countered → accepted' : 'Agent accepted', note: null },
      { label: 'Escrow funded', note: c.fundedAt ? `${c.fee} USDC locked · ${c.fundedAt}` : null },
      // While in Funded state the merchant is approving strategy actions; the
      // campaign hasn't launched yet, so don't claim "Campaign running."
      { label: c.status === 'funded' ? 'Awaiting strategy approval' : 'Campaign running',
        note: c.status === 'active' && c.daysLeft != null ? `Day ${c.windowDays - c.daysLeft} of ${c.windowDays}` : c.status === 'funded' ? 'Approve actions in chat to launch' : c.fundedAt ? 'Completed' : null },
      { label: 'Outcome resolved', note: c.status === 'success' ? `ROAS ${c.finalRoas}× ✓` : c.status === 'failure' ? `ROAS ${c.finalRoas}× — missed` : null },
      { label: 'Settlement', note: c.status === 'success' ? `${c.fee} USDC released · ${c.settledAt}` : c.status === 'failure' ? `${c.fee} USDC refunded · ${c.settledAt}` : null },
    ]
    return raw.map((s, i) => ({ ...s, state: i < idx ? 'done' : i === idx ? 'current' : 'upcoming' }))
  }

  const stages = buildStages(c)

  return (
    <>
      <SectionRow
        num={1}
        title={isLive(c.status) ? 'Live Performance' : isAwaitingFund(c.status) ? 'Fund Escrow' : 'Outcome'}
        subtitle={
          isLive(c.status) ? 'Real-time ROAS and spend tracking'
          : isAwaitingFund(c.status) ? 'Lock funds to launch the campaign'
          : c.status === 'success' ? 'Contract settled — target met'
          : c.status === 'failure' ? 'Contract closed — target missed'
          : 'Contract resolved'
        }
      />
      <StatusSection />

      <SectionRow num={2} title="Lifecycle" subtitle="Contract stages and milestones" />
      <InnerCard>
        <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column' }}>
          {stages.map((s, i) => {
            const isDone = s.state === 'done', isCurrent = s.state === 'current', isLast = i === stages.length - 1
            const dotColor = isDone ? C.indigo : isCurrent ? C.amber : C.faint
            return (
              <div key={i} style={{ display: 'flex', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                  <div style={{ width: '9px', height: '9px', borderRadius: '50%', background: isDone || isCurrent ? dotColor : 'transparent', border: `2px solid ${dotColor}`, flexShrink: 0, animation: isCurrent ? 'agentThinkPulse 1.5s ease-in-out infinite' : 'none' }}/>
                  {!isLast && <div style={{ width: '2px', flex: 1, minHeight: '14px', background: isDone ? C.indigo : '#e8e7f2', margin: '2px 0', borderRadius: '1px', opacity: isDone ? 1 : 0.3 }}/>}
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

      <SectionRow num={3} title="Strategy & Terms" subtitle="Contract parameters and agent plan" />
      <InnerCard style={{ marginBottom: '8px' }}>
        <div style={{ padding: '4px 0' }}>
          {rows.map(([k, v], i, arr) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 14px', borderBottom: i < arr.length - 1 ? '1px solid var(--c-panel-bg)' : 'none' }}>
              <span style={{ fontSize: '12px', color: C.muted, fontFamily: font }}>{k}</span>
              <span style={{ fontSize: '12px', fontWeight: 600, color: C.sub, fontFamily: font }}>{v}</span>
            </div>
          ))}
        </div>
      </InnerCard>
      {c.strategy && (
        <InnerCard>
          <div style={{ padding: '12px 14px' }}>
            <p style={{ fontSize: '12px', color: C.sub, lineHeight: 1.7, margin: '0 0 10px', fontFamily: font }}>{c.strategy.summary}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
              {c.strategy.actions.map((a, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                  <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: a.done ? '#f0fdf4' : C.indigoBg, border: `1.5px solid ${a.done ? C.green : C.faint}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '1px' }}>
                    {a.done ? <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> : <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: C.faint }}/>}
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

// ─── WORKSPACE RIGHT PANEL ────────────────────────────────────────────────────
// Standalone panel used by WorkspacePage when NegotiationView stays mounted.
// Accepts the raw contract object returned by onFinalized / getContract.
export function WorkspaceRightPanel({ contract, id, refetchContract }) {
  const [isMobile, setIsMobile] = React.useState(false)
  const [showPanel, setShowPanel] = React.useState(false)

  React.useLayoutEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const c = React.useMemo(() => {
    if (!contract) return null
    // If the backend says Settled with a known outcome, collapse to the
    // outcome-specific frontend slug so the existing success/failure UI fires.
    const rawStatus = normalizeStatus(contract.status)
    const outcome   = contract.resolution_outcome ?? contract.resolutionOutcome ?? null
    const status    = rawStatus === 'settled' && (outcome === 'success' || outcome === 'failure') ? outcome : rawStatus
    return {
      id:          contract.id,
      name:        contract.campaign_goal || contract.name || 'Campaign',
      title:       contract.title || null,
      status,
      targetRoas:  contract.target_roas  ?? contract.targetRoas,
      minSpend:    contract.min_spend_usd ?? contract.minSpend,
      windowDays:  contract.time_window_days ?? contract.windowDays,
      fee:         contract.success_fee_usdc ?? contract.fee,
      createdAt:   contract.created_at ? new Date(contract.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : contract.createdAt,
      prob: contract.prob ?? null, risk: contract.risk ?? null,
      expectedRange: contract.expectedRange ?? null,
      agentDecision: contract.agentDecision ?? null,
      currentRoas: contract.currentRoas ?? null, spend: contract.spend ?? null,
      daysLeft: contract.daysLeft ?? null, roasHistory: contract.roasHistory ?? null,
      fundedAt: contract.fundedAt ?? null, strategy: contract.strategy ?? null,
      finalRoas:    contract.final_roas    ?? contract.finalRoas    ?? null,
      settledAt:    contract.settled_at    ? new Date(contract.settled_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : contract.settledAt ?? null,
      settleTxHash: contract.settle_tx_hash ?? contract.settleTxHash ?? null,
      refundTxHash: contract.refund_tx_hash ?? contract.refundTxHash ?? null,
    }
  }, [contract])

  // Hide entirely when there's no contract OR when terms haven't been
  // finalized yet (negotiating phase). Nothing meaningful to render here
  // until the offer is locked in.
  if (!c) return null
  if (isNegotiating(c.status) || c.targetRoas == null) return null

  const badge      = STATUS_COLORS[c.status] || STATUS_COLORS.failure
  const badgeLabel = STATUS_LABEL[c.status]  || c.status

  return (
    <>
      {/* Mobile floating trigger */}
      {isMobile && !showPanel && (
        <button onClick={() => setShowPanel(true)} style={{ position: 'fixed', bottom: '100px', right: '16px', zIndex: 40, background: C.indigo, color: '#fff', border: 'none', borderRadius: '20px', padding: '8px 14px', fontSize: '12px', fontWeight: 700, fontFamily: font, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: '0 2px 12px rgba(59,130,246,0.3)' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M15 3v18"/></svg>
          Details
        </button>
      )}
      <div style={isMobile
        ? { position: 'fixed', inset: 0, zIndex: 50, display: showPanel ? 'flex' : 'none', flexDirection: 'column', background: C.surface }
        : { width: '420px', flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: C.surface, padding: '8px 8px 8px 0', animation: 'panel-slide-in 0.32s cubic-bezier(0.4, 0, 0.2, 1)' }
      }>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRadius: isMobile ? '0' : '12px', background: 'var(--c-panel-bg)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', flexShrink: 0, gap: '8px', borderBottom: '1px solid var(--c-inner-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
              {isMobile && <button onClick={() => setShowPanel(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, padding: '2px', display: 'flex', marginRight: '2px', flexShrink: 0 }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg></button>}
              <span style={{ fontSize: '13px', fontWeight: 700, color: C.text, fontFamily: font, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title || c.name}</span>
              <span style={{ fontSize: '10px', fontWeight: 700, color: badge.color, background: badge.bg, padding: '2px 8px', borderRadius: '20px', whiteSpace: 'nowrap', flexShrink: 0 }}>{badgeLabel}</span>
            </div>
            {!isNegotiating(c.status) && (
              <Link href={`/contracts/${c.id}`} style={{ fontSize: '11px', fontWeight: 600, color: C.muted, border: `1px solid ${C.border}`, borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontFamily: font, whiteSpace: 'nowrap', textDecoration: 'none', flexShrink: 0, transition: 'color 0.15s, border-color 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.color = C.indigo; e.currentTarget.style.borderColor = C.indigo }}
                onMouseLeave={e => { e.currentTarget.style.color = C.muted; e.currentTarget.style.borderColor = C.border }}>Full detail →</Link>
            )}
          </div>
          <div style={{ flex: 1, overflowY: 'auto', paddingBottom: '12px' }}>
            <PanelContent c={c} refetchContract={refetchContract} />
          </div>
        </div>
      </div>
    </>
  )
}

// ─── WORKSPACE VIEW ───────────────────────────────────────────────────────────
export default function WorkspaceView({ id, contract, refetchContract }) {
  const router = useRouter()
  const { getToken, isLoaded, isSignedIn } = useAuth()
  const [inputAreaHeight, setInputAreaHeight] = React.useState(120)
  const [approvalMode, setApprovalMode]       = React.useState('manual')
  const [isMobile, setIsMobile]               = React.useState(false)
  const [showPanel, setShowPanel]             = React.useState(false)

  const scrollRef       = React.useRef(null)
  const desktopInputRef = React.useRef(null)
  const mobileInputRef  = React.useRef(null)
  const inputKey        = React.useRef(0)

  // contract.id is the server-assigned UUID; id from useParams may still be the original
  // local session key (ws_xxx) if window.history.replaceState was used during negotiation
  // without triggering a Next.js router navigation. Always prefer the UUID from the contract.
  const effectiveId = contract?.id ?? id

  const { messages, isThinking, isStreaming, stopGeneration, appendMessage, sendMessage,
          thinking, activeStepId, liveDetail, generatedTitle, toggleThinking } = useMessages(effectiveId)

  // Seed from localStorage session cache so the chat isn't blank while useMessages fetches.
  // useNegotiationStream writes messages under the contract UUID; extract text from segments.
  const [seedMessages] = React.useState(() => {
    if (typeof window === 'undefined') return []
    try {
      return (getSession(effectiveId)?.messages || [])
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => {
          if (m.role === 'assistant') {
            const text = m.segments
              ? m.segments.filter(s => s.type === 'text').map(s => s.content).join('')
              : (m.content || m.text || '')
            return { role: 'agent', text, time: '' }
          }
          return { role: 'user', text: m.content || m.text || '', time: '' }
        })
        .filter(m => m.text)
    } catch { return [] }
  })
  const displayMessages = messages.length > 0 ? messages : seedMessages

  // Build display contract — API shape normalized
  const c = React.useMemo(() => {
    if (!contract) return null
    const rawStatus = normalizeStatus(contract.status)
    const outcome   = contract.resolution_outcome ?? contract.resolutionOutcome ?? null
    const status    = rawStatus === 'settled' && (outcome === 'success' || outcome === 'failure') ? outcome : rawStatus
    return {
      id:          contract.id,
      name:        contract.campaign_goal || contract.name || 'Campaign',
      title:       contract.title || generatedTitle || null,
      status,
      targetRoas:  contract.target_roas  ?? contract.targetRoas,
      minSpend:    contract.min_spend_usd ?? contract.minSpend,
      windowDays:  contract.time_window_days ?? contract.windowDays,
      fee:         contract.success_fee_usdc ?? contract.fee,
      createdAt:   contract.created_at ? new Date(contract.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : contract.createdAt,
      // mock / live performance fields pass through
      prob: contract.prob ?? null, risk: contract.risk ?? null,
      expectedRange: contract.expectedRange ?? null,
      agentDecision: contract.agentDecision ?? null, agentNote: contract.agentNote ?? null,
      currentRoas: contract.currentRoas ?? null, spend: contract.spend ?? null,
      daysLeft: contract.daysLeft ?? null, roasHistory: contract.roasHistory ?? null,
      fundedAt: contract.fundedAt ?? null, strategy: contract.strategy ?? null,
      finalRoas:    contract.final_roas    ?? contract.finalRoas    ?? null,
      settledAt:    contract.settled_at    ? new Date(contract.settled_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : contract.settledAt ?? null,
      settleTxHash: contract.settle_tx_hash ?? contract.settleTxHash ?? null,
      refundTxHash: contract.refund_tx_hash ?? contract.refundTxHash ?? null,
    }
  }, [contract, generatedTitle])

  React.useLayoutEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check(); window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  React.useEffect(() => {
    const saved = localStorage.getItem('bidtopus-approval-mode')
    if (saved === 'auto' || saved === 'manual') setApprovalMode(saved)
  }, [])

  React.useEffect(() => {
    const update = () => {
      const h = Math.max(mobileInputRef.current?.offsetHeight || 0, desktopInputRef.current?.offsetHeight || 0)
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
  }, [displayMessages, isThinking])

  const processedMessages = React.useMemo(() => {
    const result = []
    let i = 0
    while (i < displayMessages.length) {
      const msg = displayMessages[i]
      if (msg.role === 'thinking-step') {
        // Skip all consecutive thinking-step messages in this sequence.
        // Historical thinking from negotiation/background tasks must not leak
        // into the workspace view — internal work is not user-facing content.
        // Live thinking during workspace chat is handled separately via the
        // `thinking` state from useMessages.
        const seqId = msg.thinkingSequenceId || msg.id
        while (i < displayMessages.length && displayMessages[i].role === 'thinking-step' && (displayMessages[i].thinkingSequenceId || displayMessages[i].id) === seqId) {
          i++
        }
      } else if (msg.role === 'agent' && !msg.text?.trim()) {
        // Skip empty agent bubbles produced by tool_call/tool_result DB rows
        // or follow-up streams that produced no visible content.
        i++
      } else {
        result.push(msg)
        i++
      }
    }
    return result
  }, [displayMessages])

  const [openSeqs, setOpenSeqs] = React.useState(new Set())
  const toggleSeq = React.useCallback((seqId) => {
    setOpenSeqs(prev => { const next = new Set(prev); if (next.has(seqId)) next.delete(seqId); else next.add(seqId); return next })
  }, [])

  const { getStatus, getError, approve } = useActionApprovals(effectiveId, {
    onApproved: () => setTimeout(() => appendMessage({ role: 'agent', text: "Action confirmed. Executing now — I'll report back with results.", time: 'Just now' }), 350),
  })

  const [localTitle, setLocalTitle] = React.useState(() => {
    if (typeof window === 'undefined') return null
    try { return getSession(effectiveId)?.title || null } catch { return null }
  })

  const saveTitle = React.useCallback((newTitle) => {
    setLocalTitle(newTitle)
    upsertSession(effectiveId, { title: newTitle })
    createApiClient(getToken).updateTitle(effectiveId, newTitle).catch(() => {})
  }, [effectiveId, getToken])

  const isResolved = c?.status === 'success' || c?.status === 'failure'
  const badge      = STATUS_COLORS[c?.status] || STATUS_COLORS.failure
  const badgeLabel = STATUS_LABEL[c?.status]  || c?.status
  // Hide the right detail panel entirely while the merchant and agent are
  // still negotiating terms — there's nothing meaningful to display until
  // the offer is finalized (status moves past 'negotiating' and targetRoas
  // is set).
  const hasContractDetails = c && !isNegotiating(c.status) && c.targetRoas != null

  if (!c) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg }}>
      <ThinkingDots />
    </div>
  )

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      <WorkspaceHeader
        title={localTitle || c.title || c.name}
        contractId={id}
        contractMetaAccountId={contract?.meta_ads_account_id}
        onTitleSave={saveTitle}
        onNew={() => router.push(`/workspace/${generateSessionId()}`)}
      />

      {/* Mobile header */}
      <div className="app-mobile-header">
        <span style={{ fontSize: '15px', fontWeight: 700, color: C.text, flex: 1, fontFamily: font, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{localTitle || c.title || c.name}</span>
        {hasContractDetails && (
          <button onClick={() => setShowPanel(true)} style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: '7px', cursor: 'pointer', color: C.indigo, padding: '5px 11px', display: 'flex', alignItems: 'center', gap: '5px', fontFamily: font, fontSize: '12px', fontWeight: 600 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M15 3v18"/></svg>
            Details
          </button>
        )}
      </div>

      {approvalMode === 'manual' && c.status === 'active' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 20px', background: C.amberBg, borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.amber} strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span style={{ fontSize: '12px', color: C.amber, fontWeight: 600, fontFamily: font }}>Manual approval mode</span>
          <span style={{ fontSize: '12px', color: C.muted, fontFamily: font }}>— agent pauses before each Meta Ads action.</span>
          <Link href="/settings" style={{ marginLeft: 'auto', fontSize: '11px', color: C.indigo, fontWeight: 600, textDecoration: 'none', fontFamily: font }}>Settings →</Link>
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Chat */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: C.surface, position: 'relative', minWidth: 0 }}>
          <div ref={scrollRef} className="agent-msgs-area" style={{
            flex: 1, overflowY: 'auto', overflowAnchor: 'none',
            paddingTop: '24px', paddingBottom: `${inputAreaHeight + 16}px`,
            // Fade the top edge so messages soften into the header instead of
            // hard-cutting against it as they scroll up. Bottom edge is
            // already handled by the input bar's gradient overlay.
            maskImage: 'linear-gradient(to bottom, transparent 0, black 24px, black 100%)',
            WebkitMaskImage: 'linear-gradient(to bottom, transparent 0, black 24px, black 100%)',
          }}>
            {processedMessages.map((msg, i) => {
              // The streaming bubble is always the last agent message while SSE
              // is open — pass `streaming` so AgentBubble fires the per-word
              // fade-in animation and renders the blinking caret.
              const isLastAgent = isStreaming && msg.role === 'agent' && i === processedMessages.length - 1
              return (
                <div key={i} style={{ maxWidth: '680px', margin: '0 auto', width: '100%', padding: '0 20px 14px' }}>
                  {msg._type === 'thinking-block' && <ThinkingBlock thinking={{ steps: msg.steps, isComplete: true, isOpen: openSeqs.has(msg.seqId) }} activeStepId={null} liveDetail="" onToggle={() => toggleSeq(msg.seqId)} />}
                  {msg.role === 'user'         && <UserBubble msg={msg} />}
                  {msg.role === 'agent'        && <AgentBubble msg={msg} streaming={isLastAgent} />}
                  {msg.role === 'agent-update' && <AgentUpdate msg={msg} />}
                  {msg.role === 'agent-action' && <AgentActionCard msg={msg} effectiveStatus={approvalMode === 'auto' && getStatus(msg.id, msg.status) === 'pending' ? 'auto' : getStatus(msg.id, msg.status)} onApprove={() => approve(msg.id, msg.plan_id)} error={getError(msg.id)} />}
                  {msg.role === 'system'       && <SystemEvent msg={msg} />}
                </div>
              )
            })}
            {thinking.steps.length > 0 && (
              <div style={{ maxWidth: '680px', margin: '0 auto', width: '100%', padding: '0 20px 4px' }}>
                <ThinkingBlock thinking={thinking} activeStepId={activeStepId} liveDetail={liveDetail} onToggle={toggleThinking} />
              </div>
            )}
            {isThinking && <div style={{ maxWidth: '680px', margin: '0 auto', width: '100%', padding: '0 20px 16px' }}><ThinkingDots /></div>}
          </div>

          <div ref={mobileInputRef} className="agent-input-mobile" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '32px 14px 20px', background: `linear-gradient(to bottom, transparent, ${C.surface} 35%)` }}>
            <AgentInputBar key={`m-${inputKey.current}`} onSend={sendMessage} onStop={stopGeneration} isGenerating={isThinking || isStreaming} chatReady={!isResolved} loading={isThinking} placeholder={isResolved ? 'Contract resolved — read-only' : 'Ask the agent anything…'} fontSize="16px" paddingLeft="16px" />
          </div>
          <div ref={desktopInputRef} className="agent-input-desktop" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '40px 40px 16px', background: `linear-gradient(to bottom, transparent, ${C.surface} 35%)` }}>
            <div style={{ maxWidth: '680px', margin: '0 auto' }}>
              <AgentInputBar key={`d-${inputKey.current}`} onSend={sendMessage} onStop={stopGeneration} isGenerating={isThinking || isStreaming} chatReady={!isResolved} loading={isThinking} placeholder={isResolved ? 'Contract resolved — read-only' : 'Ask the agent or send an update…'} fontSize="13px" paddingLeft="18px" />
            </div>
            <div style={{ fontSize: '11px', color: C.muted, marginTop: '8px', textAlign: 'center', fontFamily: font }}>Enter to send · Shift+Enter for new line</div>
          </div>
        </div>

        {/* Right panel — hidden until contract terms are finalized */}
        {hasContractDetails && (
          <div style={isMobile ? { position: 'fixed', inset: 0, zIndex: 50, display: showPanel ? 'flex' : 'none', flexDirection: 'column', background: C.surface } : { width: '420px', flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: C.surface, padding: '8px 8px 8px 0', animation: 'panel-slide-in 0.32s cubic-bezier(0.4, 0, 0.2, 1)' }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRadius: isMobile ? '0' : '12px', background: 'var(--c-panel-bg)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', flexShrink: 0, gap: '8px', borderBottom: '1px solid var(--c-inner-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                  {isMobile && <button onClick={() => setShowPanel(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, padding: '2px', display: 'flex', marginRight: '2px', flexShrink: 0 }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg></button>}
                  <span style={{ fontSize: '13px', fontWeight: 700, color: C.text, fontFamily: font, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{localTitle || c.title || c.name}</span>
                  <span style={{ fontSize: '10px', fontWeight: 700, color: badge.color, background: badge.bg, padding: '2px 8px', borderRadius: '20px', whiteSpace: 'nowrap', flexShrink: 0 }}>{badgeLabel}</span>
                </div>
                <Link href={`/contracts/${c.id}`} style={{ fontSize: '11px', fontWeight: 600, color: C.muted, border: `1px solid ${C.border}`, borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontFamily: font, whiteSpace: 'nowrap', textDecoration: 'none', flexShrink: 0, transition: 'color 0.15s, border-color 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.color = C.indigo; e.currentTarget.style.borderColor = C.indigo }}
                  onMouseLeave={e => { e.currentTarget.style.color = C.muted; e.currentTarget.style.borderColor = C.border }}>Full detail →</Link>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', paddingBottom: '12px' }}>
                <PanelContent c={c} refetchContract={refetchContract} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
