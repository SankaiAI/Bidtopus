'use client'
import React from 'react'
import Link from 'next/link'
import Logo from '@/components/Logo'

const C = {
  bg:     '#f7f6f3',   // warm off-white — not pure white
  card:   '#ffffff',
  surface:'#eeecea',   // warm section background
  border: '#e2e0d8',
  text:   '#0e0d1a',
  muted:  '#6b6880',
  sub:    '#a09daf',
  indigo: '#4F46E5',
  green:  '#10B981',
}

// ─── NAVBAR ──────────────────────────────────────────────────────────────────
function Navbar() {
  const [menuOpen, setMenuOpen] = React.useState(false)
  return (
    <nav style={{ position: 'sticky', top: 0, zIndex: 50, background: 'rgba(247,246,243,0.92)', backdropFilter: 'blur(12px)' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '0 24px', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Link href="/landing" style={{ textDecoration: 'none' }}>
          <Logo color={C.text} size={18} />
        </Link>
        <div className="nav-links" style={{ display: 'flex', alignItems: 'center', gap: '28px' }}>
          <a href="#features" className="nav-link">How it works</a>
          <a href="#comparison" className="nav-link">Why OutcomeX</a>
          <a href="#" className="nav-link">Docs</a>
        </div>
        <div className="nav-cta" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Link href="/dashboard" style={{ fontSize: '13px', fontWeight: 600, color: C.muted, textDecoration: 'none' }}>Sign in</Link>
          <Link href="/contracts/new" style={{
            fontSize: '13px', fontWeight: 700, color: '#fff', background: C.indigo,
            padding: '8px 18px', borderRadius: '8px', textDecoration: 'none', transition: 'opacity 0.15s',
          }}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
          >Create a contract</Link>
        </div>
        <button className="nav-hamburger" onClick={() => setMenuOpen(v => !v)}
          style={{ display: 'none', background: 'none', border: 'none', cursor: 'pointer', color: C.text, padding: '4px' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            {menuOpen ? <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></> : <><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></>}
          </svg>
        </button>
      </div>
      {menuOpen && (
        <div style={{ background: C.surface, padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <a href="#features" className="nav-link" onClick={() => setMenuOpen(false)}>How it works</a>
          <a href="#comparison" className="nav-link" onClick={() => setMenuOpen(false)}>Why OutcomeX</a>
          <Link href="/contracts/new" onClick={() => setMenuOpen(false)}
            style={{ fontSize: '14px', fontWeight: 700, color: '#fff', background: C.indigo, padding: '10px 18px', borderRadius: '8px', textDecoration: 'none', textAlign: 'center' }}>
            Create a contract
          </Link>
        </div>
      )}
    </nav>
  )
}

// ─── HERO ─────────────────────────────────────────────────────────────────────
function ContractCard() {
  return (
    <div style={{ background: C.card, borderRadius: '16px', boxShadow: '0 4px 40px rgba(79,70,229,0.10), 0 1px 6px rgba(0,0,0,0.06)', overflow: 'hidden', maxWidth: '340px', width: '100%' }}>
      <div style={{ padding: '14px 20px', background: C.surface, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: '10px', fontFamily: 'monospace', color: C.sub, letterSpacing: '0.05em', marginBottom: '3px' }}>CONTRACT #4821</div>
          <div style={{ fontSize: '14px', fontWeight: 700, color: C.text }}>Product X · Meta Ads</div>
        </div>
        <span style={{ fontSize: '11px', fontWeight: 700, color: C.green, background: '#dcfce7', padding: '3px 10px', borderRadius: '20px' }}>Funded</span>
      </div>
      <div style={{ padding: '16px 20px 14px' }}>
        <div style={{ fontSize: '10px', fontWeight: 700, color: C.sub, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Contract Terms</div>
        {[['Target', 'ROAS ≥ 2.0'], ['Window', '7 days'], ['Min. spend', '$500'], ['Success fee', '100 USDC']].map(([k, v], i, arr) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : 'none' }}>
            <span style={{ fontSize: '13px', color: C.muted }}>{k}</span>
            <span style={{ fontSize: '13px', fontWeight: 700, color: C.text }}>{v}</span>
          </div>
        ))}
      </div>
      <div style={{ margin: '0 20px 20px', background: C.surface, borderRadius: '10px', padding: '12px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <span style={{ fontSize: '12px', color: C.muted }}>Success probability</span>
          <span style={{ fontSize: '16px', fontWeight: 800, color: C.indigo }}>68%</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
          <span style={{ fontSize: '13px', fontWeight: 700, color: C.green }}>Contract accepted</span>
          <span style={{ fontSize: '12px', color: C.sub, marginLeft: 'auto' }}>100 USDC escrowed</span>
        </div>
      </div>
    </div>
  )
}

function Hero() {
  return (
    <section style={{ padding: '96px 24px 88px', maxWidth: '1100px', margin: '0 auto' }}>
      <div className="hero-grid">
        <div>
          <h1 style={{ fontSize: 'clamp(38px, 4.8vw, 58px)', fontWeight: 800, color: C.text, lineHeight: 1.07, letterSpacing: '-0.035em', margin: '0 0 20px' }}>
            Your Meta Ads agent.<br />
            <span style={{ color: C.indigo }}>Paid only when it delivers.</span>
          </h1>
          <p style={{ fontSize: '18px', color: C.muted, lineHeight: 1.7, margin: '0 0 10px', maxWidth: '420px', fontWeight: 400 }}>
            Set a ROAS target. The agent evaluates if it can hit it, runs your campaign, and collects its fee only after the result is verified.
          </p>
          <p style={{ fontSize: '14px', color: C.sub, margin: '0 0 40px' }}>
            Miss the target → full refund. No invoices. No "good effort."
          </p>
          <div className="hero-ctas" style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <Link href="/contracts/new" style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              background: C.indigo, color: '#fff', fontSize: '14px', fontWeight: 700,
              padding: '13px 24px', borderRadius: '9px', textDecoration: 'none', transition: 'opacity 0.15s',
            }}
              onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
              onMouseLeave={e => e.currentTarget.style.opacity = '1'}
            >
              Create a performance contract
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </Link>
            <a href="#features" style={{ color: C.muted, fontSize: '14px', fontWeight: 600, textDecoration: 'none', transition: 'color 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.color = C.text}
              onMouseLeave={e => e.currentTarget.style.color = C.muted}
            >See how it works →</a>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <ContractCard />
        </div>
      </div>
    </section>
  )
}

// ─── BUILT-WITH STRIP ─────────────────────────────────────────────────────────
function BuiltWith() {
  return (
    <div style={{ padding: '18px 24px' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '32px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '11px', fontWeight: 600, color: C.sub, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Built with</span>
        {['Meta Ads', 'Circle USDC', 'Arc Chain'].map(name => (
          <span key={name} style={{ fontSize: '13px', fontWeight: 700, color: C.sub, letterSpacing: '-0.01em' }}>{name}</span>
        ))}
      </div>
    </div>
  )
}

// ─── MOCK UIs for feature sections ────────────────────────────────────────────
function MockContractForm() {
  const fields = [
    { label: 'Campaign goal', value: 'Product X — Retargeting', mono: false },
    { label: 'Target ROAS', value: '≥ 2.0×', mono: true },
    { label: 'Evaluation window', value: '7 days', mono: true },
    { label: 'Minimum ad spend', value: '$500', mono: true },
    { label: 'Success fee (USDC)', value: '100 USDC', mono: true },
  ]
  return (
    <div style={{ background: C.card, borderRadius: '16px', boxShadow: '0 4px 32px rgba(0,0,0,0.08)', overflow: 'hidden', maxWidth: '360px', width: '100%' }}>
      <div style={{ padding: '16px 20px', background: C.surface }}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: C.text }}>New performance contract</div>
        <div style={{ fontSize: '11px', color: C.sub, marginTop: '2px' }}>Specify the terms — the agent does the rest</div>
      </div>
      <div style={{ padding: '16px 20px' }}>
        {fields.map((f, i) => (
          <div key={f.label} style={{ marginBottom: i < fields.length - 1 ? '14px' : '20px' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: C.sub, marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{f.label}</div>
            <div style={{
              padding: '9px 12px', background: C.surface, borderRadius: '8px',
              fontSize: '13px', fontWeight: f.mono ? 700 : 400,
              color: f.mono ? C.text : C.muted,
              fontFamily: f.mono ? 'monospace' : 'inherit',
            }}>{f.value}</div>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            background: C.indigo, color: '#fff', fontSize: '13px', fontWeight: 700,
            padding: '10px 18px', borderRadius: '8px', cursor: 'pointer',
          }}>
            Submit to agent
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </div>
        </div>
      </div>
    </div>
  )
}

function MockEvaluation() {
  return (
    <div style={{ background: C.card, borderRadius: '16px', boxShadow: '0 4px 32px rgba(0,0,0,0.08)', overflow: 'hidden', maxWidth: '360px', width: '100%' }}>
      <div style={{ padding: '14px 20px', background: C.surface }}>
        <div style={{ fontSize: '10px', fontFamily: 'monospace', color: C.sub, letterSpacing: '0.05em', marginBottom: '3px' }}>CONTRACT #4821 · EVALUATION</div>
        <div style={{ fontSize: '14px', fontWeight: 700, color: C.text }}>Agent underwriting result</div>
      </div>
      <div style={{ padding: '16px 20px' }}>
        {[
          ['Requested ROAS', '≥ 2.0×'],
          ['Expected ROAS range', '1.7 – 2.4×'],
          ['Success probability', '68%'],
          ['Risk level', 'Medium'],
          ['Recommended action', 'Accept'],
        ].map(([k, v], i, arr) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : 'none', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', color: C.muted }}>{k}</span>
            <span style={{ fontSize: '13px', fontWeight: 700, color: k === 'Success probability' ? C.indigo : k === 'Recommended action' ? C.green : C.text }}>{v}</span>
          </div>
        ))}
      </div>
      <div style={{ margin: '0 20px 20px', padding: '12px 16px', background: '#f0fdf4', borderRadius: '10px' }}>
        <div style={{ fontSize: '12px', fontWeight: 700, color: C.green, marginBottom: '6px' }}>Agent response</div>
        <div style={{ fontSize: '13px', color: '#065f46', lineHeight: 1.6, fontStyle: 'italic' }}>
          "I estimate a 68% chance of achieving ROAS ≥ 2.0 within 7 days. I accept this contract at 100 USDC."
        </div>
      </div>
    </div>
  )
}

function MockSettlement() {
  return (
    <div style={{ background: C.card, borderRadius: '16px', boxShadow: '0 4px 32px rgba(0,0,0,0.08)', overflow: 'hidden', maxWidth: '360px', width: '100%' }}>
      <div style={{ padding: '14px 20px', background: C.surface, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: '10px', fontFamily: 'monospace', color: C.sub, letterSpacing: '0.05em', marginBottom: '3px' }}>CONTRACT #4821 · RESOLVED</div>
          <div style={{ fontSize: '14px', fontWeight: 700, color: C.text }}>Product X Campaign</div>
        </div>
        <span style={{ fontSize: '11px', fontWeight: 700, color: C.green, background: '#dcfce7', padding: '3px 10px', borderRadius: '20px' }}>Success</span>
      </div>
      <div style={{ padding: '16px 20px 14px' }}>
        <div style={{ fontSize: '10px', fontWeight: 700, color: C.sub, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Final Results</div>
        {[
          ['Final ROAS', '2.31×', true],
          ['Total spend', '$587', true],
          ['Target ROAS', '≥ 2.0×', false],
          ['Days elapsed', '6 of 7', false],
        ].map(([k, v, hit], i, arr) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : 'none' }}>
            <span style={{ fontSize: '13px', color: C.muted }}>{k}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: C.text }}>{v}</span>
              {hit && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
            </div>
          </div>
        ))}
      </div>
      <div style={{ margin: '0 20px 20px', padding: '14px 16px', background: '#f0fdf4', borderRadius: '10px' }}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: C.green, marginBottom: '4px' }}>Settlement complete</div>
        <div style={{ fontSize: '12px', color: '#065f46', lineHeight: 1.6 }}>100 USDC released to agent wallet · Arc transaction confirmed</div>
      </div>
    </div>
  )
}

// ─── FEATURE SECTIONS ─────────────────────────────────────────────────────────
function FeatureSection({ id, label, headline, description, bullets, cta, visual, reverse = false, bg = C.bg }) {
  return (
    <section id={id} style={{ padding: '72px 24px', background: bg }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
        <div className={`feature-grid${reverse ? ' feature-grid-reverse' : ''}`}>
          {/* Text */}
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            {label && (
              <div style={{ fontSize: '12px', fontWeight: 700, color: C.indigo, letterSpacing: '0.06em', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ display: 'inline-block', width: '20px', height: '2px', background: C.indigo, borderRadius: '2px' }} />
                {label}
              </div>
            )}
            <h2 style={{ fontSize: 'clamp(26px, 3.5vw, 38px)', fontWeight: 800, color: C.text, letterSpacing: '-0.025em', margin: '0 0 16px', lineHeight: 1.15 }}>
              {headline}
            </h2>
            <p style={{ fontSize: '16px', color: C.muted, lineHeight: 1.75, margin: '0 0 24px', maxWidth: '440px' }}>
              {description}
            </p>
            {bullets && (
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 32px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {bullets.map(b => (
                  <li key={b} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.indigo} strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0, marginTop: '3px' }}>
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    <span style={{ fontSize: '14px', color: C.muted, lineHeight: 1.6 }}>{b}</span>
                  </li>
                ))}
              </ul>
            )}
            {cta && (
              <div>
                <Link href={cta.href} style={{
                  display: 'inline-flex', alignItems: 'center', gap: '8px',
                  background: C.indigo, color: '#fff', fontSize: '13px', fontWeight: 700,
                  padding: '11px 20px', borderRadius: '8px', textDecoration: 'none', transition: 'opacity 0.15s',
                }}
                  onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
                  onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                >
                  {cta.label}
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                </Link>
              </div>
            )}
          </div>

          {/* Visual */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: reverse ? 'flex-start' : 'flex-end' }}>
            {visual}
          </div>
        </div>
      </div>
    </section>
  )
}

// ─── COMPARISON ───────────────────────────────────────────────────────────────
function Comparison() {
  const rows = [
    { label: 'Pricing',        old: 'Monthly fee — paid whether ROAS improves or not', new_: 'USDC fee held in escrow, released only when ROAS target is verified' },
    { label: 'Risk',           old: 'Agency keeps the fee regardless of campaign outcome', new_: 'Agent earns nothing if the target is missed — risk is shared' },
    { label: 'Transparency',   old: 'Campaigns run and are reported after the fact', new_: 'Agent proposes the Meta Ads strategy; you approve before any spend' },
    { label: 'Evaluation',     old: 'Tools accept every brief without feasibility checks', new_: 'ML model underwrites each contract — agent can propose revised terms' },
    { label: 'Settlement',     old: '"Good effort" is the only clause. You argue over results.', new_: 'Automatic. ROAS hit → paid. Miss → refunded. Smart contract enforced.' },
  ]

  return (
    <section id="comparison" style={{ padding: '72px 24px', background: C.bg }}>
      <div style={{ maxWidth: '960px', margin: '0 auto' }}>
        <div style={{ marginBottom: '48px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: C.indigo, letterSpacing: '0.06em', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ display: 'inline-block', width: '20px', height: '2px', background: C.indigo, borderRadius: '2px' }} />
            Why OutcomeX
          </div>
          <h2 style={{ fontSize: 'clamp(26px, 3.5vw, 36px)', fontWeight: 800, color: C.text, letterSpacing: '-0.025em', margin: '0 0 12px' }}>
            Most AI ad tools sell access.<br />OutcomeX sells a result.
          </h2>
          <p style={{ fontSize: '15px', color: C.muted, maxWidth: '420px', lineHeight: 1.7, margin: 0 }}>
            The difference is who bears the risk when the campaign doesn't perform.
          </p>
        </div>

        <div style={{ borderRadius: '14px', overflow: 'hidden', boxShadow: '0 2px 20px rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 1fr', background: C.card }}>
            <div style={{ padding: '12px 16px' }} />
            <div style={{ padding: '13px 20px', borderLeft: `1px solid ${C.border}` }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: C.sub, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Traditional AI ad tools</span>
            </div>
            <div style={{ padding: '13px 20px', borderLeft: `1px solid ${C.border}` }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: C.indigo, textTransform: 'uppercase', letterSpacing: '0.06em' }}>OutcomeX</span>
            </div>
          </div>
          {rows.map((r, i) => (
            <div key={r.label} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 1fr', background: i % 2 === 0 ? C.card : C.bg }}>
              <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'flex-start' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: C.sub, textTransform: 'uppercase', letterSpacing: '0.05em', lineHeight: 2 }}>{r.label}</span>
              </div>
              <div style={{ padding: '14px 20px', borderLeft: `1px solid ${C.border}`, display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <span style={{ fontSize: '16px', color: C.sub, lineHeight: 1.4, flexShrink: 0 }}>–</span>
                <span style={{ fontSize: '13px', color: C.muted, lineHeight: 1.65 }}>{r.old}</span>
              </div>
              <div style={{ padding: '14px 20px', borderLeft: `1px solid ${C.border}`, display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.indigo} strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0, marginTop: '3px' }}>
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                <span style={{ fontSize: '13px', color: C.text, lineHeight: 1.65 }}>{r.new_}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── CTA ─────────────────────────────────────────────────────────────────────
function CTA() {
  return (
    <section style={{ padding: '80px 24px 100px', background: C.surface }}>
      <div style={{ maxWidth: '520px', margin: '0 auto', textAlign: 'center' }}>
        <h2 style={{ fontSize: 'clamp(26px, 3.5vw, 38px)', fontWeight: 800, color: C.text, letterSpacing: '-0.025em', margin: '0 0 16px', lineHeight: 1.15 }}>
          Set the target.<br />
          <span style={{ color: C.indigo }}>Pay only when it's hit.</span>
        </h2>
        <p style={{ fontSize: '16px', color: C.muted, lineHeight: 1.7, margin: '0 auto 32px', maxWidth: '380px' }}>
          Define your ROAS goal, agree on the fee, and let the agent prove it can deliver — or get every cent back.
        </p>
        <Link href="/contracts/new" style={{
          display: 'inline-flex', alignItems: 'center', gap: '10px',
          background: C.indigo, color: '#fff', fontSize: '15px', fontWeight: 700,
          padding: '14px 28px', borderRadius: '10px', textDecoration: 'none', transition: 'opacity 0.15s',
        }}
          onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
          onMouseLeave={e => e.currentTarget.style.opacity = '1'}
        >
          Create a performance contract
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </Link>
      </div>
    </section>
  )
}

// ─── FOOTER ───────────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer style={{ padding: '40px 24px', background: C.bg }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
        <div className="footer-cols" style={{ display: 'flex', justifyContent: 'space-between', gap: '32px' }}>
          <div>
            <Logo color={C.text} size={17} style={{ marginBottom: '10px' }} />
            <p style={{ fontSize: '12px', color: C.sub, lineHeight: 1.7, maxWidth: '220px', margin: 0 }}>
              Performance-paid AI marketing. Escrow and settlement via Circle USDC and Arc chain.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '48px' }}>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: C.sub, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '12px' }}>Product</div>
              {['How it works', 'Create a contract', 'Dashboard'].map(l => (
                <div key={l} style={{ marginBottom: '8px' }}>
                  <a href="#" style={{ fontSize: '13px', color: C.muted, textDecoration: 'none', transition: 'color 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.color = C.text}
                    onMouseLeave={e => e.currentTarget.style.color = C.muted}
                  >{l}</a>
                </div>
              ))}
            </div>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: C.sub, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '12px' }}>Legal</div>
              {['Terms', 'Privacy'].map(l => (
                <div key={l} style={{ marginBottom: '8px' }}>
                  <a href="#" style={{ fontSize: '13px', color: C.muted, textDecoration: 'none', transition: 'color 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.color = C.text}
                    onMouseLeave={e => e.currentTarget.style.color = C.muted}
                  >{l}</a>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div style={{ marginTop: '36px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
          <span style={{ fontSize: '12px', color: C.sub }}>© 2026 OutcomeX. Built for the Agora Hackathon.</span>
          <span style={{ fontSize: '12px', color: C.sub }}>Powered by Circle · Arc Chain</span>
        </div>
      </div>
    </footer>
  )
}

// ─── PAGE ─────────────────────────────────────────────────────────────────────
export default function LandingPage() {
  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
      <Navbar />
      <Hero />
      <BuiltWith />

      <FeatureSection
        id="features"
        label="Step 01 — Contract"
        headline="No subscription. A contract with a specific target."
        description="Define exactly what success means: a ROAS threshold, a minimum spend, a time window, and the fee you pay only if the result is delivered."
        bullets={[
          'Set a specific, measurable ROAS target — not a vague goal',
          'Fix the success fee upfront. No scope creep, no hidden charges',
          'No monthly seat. You pay nothing until the outcome is verified',
        ]}
        cta={{ href: '/contracts/new', label: 'Create your first contract' }}
        visual={<MockContractForm />}
        bg={C.surface}
      />

      <FeatureSection
        label="Step 02 — Evaluate"
        headline="The agent underwrites before it commits."
        description="An ML model estimates the probability of hitting your target. The agent accepts, proposes revised terms, or declines — then runs your Meta Ads campaign only after you approve the strategy."
        bullets={[
          'See the success probability before agreeing to anything',
          'Agent proposes Meta Ads strategy — you approve before spend',
          'If the target is unrealistic, the agent says so rather than accepting and failing',
        ]}
        cta={{ href: '/contracts/new', label: 'See a live evaluation' }}
        visual={<MockEvaluation />}
        reverse
        bg={C.bg}
      />

      <FeatureSection
        label="Step 03 — Settle"
        headline="Settlement is automatic. Neither party can override it."
        description="When the evaluation window closes, the result is checked against the contract. ROAS hit → USDC released to the agent. ROAS missed → full refund to you. Enforced by a smart contract on Arc — not by OutcomeX."
        bullets={[
          'No invoices, no disputes — outcome is deterministic',
          'Every settlement is recorded on Arc chain with a transaction proof',
          'The refund is guaranteed by code, not by a company promise',
        ]}
        cta={{ href: '/contracts/new', label: 'Start with zero risk' }}
        visual={<MockSettlement />}
        bg={C.surface}
      />

      <Comparison />
      <CTA />
      <Footer />
    </div>
  )
}
