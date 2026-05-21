'use client'
import React from 'react'
import Link from 'next/link'
import { SiMeta } from 'react-icons/si'
import Logo from '@/components/Logo'


const C = {
  bg:     '#f7f6f3',   // warm off-white — not pure white
  card:   '#ffffff',
  surface:'#eeecea',   // warm section background
  border: '#e2e0d8',
  text:   '#0e0d1a',
  muted:  '#6b6880',
  sub:    '#a09daf',
  indigo: '#2563EB',
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
          <a href="#comparison" className="nav-link">Why Bidtopus</a>
          <a href="#" className="nav-link">Docs</a>
        </div>
        <div className="nav-cta" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Link href="/dashboard" style={{
            fontSize: '13px', fontWeight: 700, color: '#fff', background: C.indigo,
            padding: '8px 18px', borderRadius: '8px', textDecoration: 'none', transition: 'opacity 0.15s',
          }}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
          >Dashboard</Link>
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
          <a href="#comparison" className="nav-link" onClick={() => setMenuOpen(false)}>Why Bidtopus</a>
          <Link href="/dashboard" onClick={() => setMenuOpen(false)}
            style={{ fontSize: '14px', fontWeight: 700, color: '#fff', background: C.indigo, padding: '10px 18px', borderRadius: '8px', textDecoration: 'none', textAlign: 'center' }}>
            Dashboard
          </Link>
        </div>
      )}
    </nav>
  )
}

// ─── HERO ─────────────────────────────────────────────────────────────────────
function Hero() {
  return (
    <section style={{ padding: '96px 24px 88px', maxWidth: '1100px', margin: '0 auto' }}>
      <div className="hero-grid">
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: 'clamp(34px, 4vw, 52px)', fontWeight: 800, color: C.text, lineHeight: 1.07, letterSpacing: '-0.035em', margin: '0 0 20px' }}>
            Your AI agent for Meta Ads<br />
            <span style={{ color: C.indigo }}>Paid only when it delivers</span>
          </h1>
          <p style={{ fontSize: '18px', color: C.muted, lineHeight: 1.7, margin: '0 0 10px', maxWidth: '420px', fontWeight: 400 }}>
            Set a ROAS target. The agent evaluates if it can hit it, runs your campaign, and collects its fee only after the result is verified.
          </p>
          <p style={{ fontSize: '14px', color: C.sub, margin: '0 0 40px' }}>
            Miss the target → full refund. No invoices. No "good effort."
          </p>
          <div className="hero-ctas" style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <Link href="/workspace/new" style={{
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
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minWidth: 0 }}>
          <img
            src="/icon-512.png"
            alt="Bidtopus mascot"
            width={360}
            height={360}
            style={{
              width: 'clamp(220px, 32vw, 360px)',
              height: 'auto',
              filter: 'drop-shadow(0 24px 60px rgba(37,99,235,0.22))',
            }}
          />
        </div>
      </div>
    </section>
  )
}

// ─── BUILT-WITH STRIP ─────────────────────────────────────────────────────────
// Official brand logos:
//   - Meta:   react-icons/SiMeta (Simple Icons, CC0)
//   - Circle: /logos/circle.avif from circle.com (wordmark stands alone — no label)
//   - Arc:    inlined from arc.io's official SVG (uses currentColor so we can
//             dynamically swap from grayscale to brand color on hover)
function ArcLogo({ size = 20 }) {
  // Path verbatim from arc.io's footer icon SVG. fill="currentColor" so we
  // control the color from React rather than baking white into the asset.
  return (
    <svg width={size} height={size * (32/31)} viewBox="0 0 31 32" fill="none" aria-hidden="true">
      <path
        fill="currentColor"
        d="M0 32C0.260374 24.166 1.59328 16.8547 3.82135 11.1696C6.64316 3.96673 10.728 0 15.3227 0C19.9174 0 24.0016 3.96673 26.824 11.1696C28.292 14.9157 29.372 19.3668 30.0119 24.2089C30.0691 24.6414 30.1178 25.0809 30.1678 25.5195C30.184 25.5466 30.1938 25.5718 30.1905 25.5923C30.1905 25.5923 30.5666 27.9326 30.6465 32H30.604C30.0462 31.5439 23.4681 26.3931 12.5636 27.8845C12.7282 26.0457 12.9544 24.2565 13.2467 22.5415C13.2617 22.4538 13.2789 22.3692 13.2942 22.2821C17.5711 22.1536 21.3146 22.6486 24.1853 23.2972C24.1746 23.2293 24.1657 23.1594 24.1547 23.0918C23.5647 19.4302 22.6941 16.0779 21.5717 13.2131C19.7364 8.52888 17.3416 5.61852 15.3227 5.61852C13.3038 5.61852 10.909 8.52888 9.07379 13.2131C8.62954 14.3462 8.22512 15.5545 7.86244 16.8291C7.35258 18.615 6.92424 20.5296 6.58214 22.5413C6.0758 25.5124 5.75944 28.6987 5.64292 32H0Z"
      />
    </svg>
  )
}

// Grayscale at rest, brand-color on hover — the standard "Powered by" pattern.
function BuiltWithItem({ children, label, href }) {
  const [hover, setHover] = React.useState(false)
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '10px',
        textDecoration: 'none',
        color: hover ? C.text : C.sub,
        filter: hover ? 'none' : 'grayscale(1) opacity(0.6)',
        transition: 'color 0.2s, filter 0.2s',
      }}
    >
      {children}
      {label && <span style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '-0.01em' }}>{label}</span>}
    </a>
  )
}

function BuiltWith() {
  return (
    <div style={{ padding: '18px 24px' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '36px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '11px', fontWeight: 600, color: C.sub, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Built with</span>

        <BuiltWithItem label="Meta Ads" href="https://www.facebook.com/business/ads">
          <SiMeta size={20} color="#0866FF" />
        </BuiltWithItem>

        <BuiltWithItem href="https://www.circle.com/">
          <img
            src="/logos/circle.avif"
            alt="Circle"
            style={{ display: 'block', height: '20px', width: 'auto' }}
          />
        </BuiltWithItem>

        <BuiltWithItem label="Arc Chain" href="https://www.arc.io/">
          <ArcLogo size={20} />
        </BuiltWithItem>
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
            Why Bidtopus
          </div>
          <h2 style={{ fontSize: 'clamp(26px, 3.5vw, 36px)', fontWeight: 800, color: C.text, letterSpacing: '-0.025em', margin: '0 0 12px' }}>
            Most AI ad tools sell access.<br />Bidtopus sells a result.
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
              <span style={{ fontSize: '11px', fontWeight: 700, color: C.indigo, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Bidtopus</span>
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
        <Link href="/workspace/new" style={{
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
          <span style={{ fontSize: '12px', color: C.sub }}>© 2026 Bidtopus. Built for the Agora Hackathon.</span>
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
        cta={{ href: '/workspace/new', label: 'Create your first contract' }}
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
        cta={{ href: '/workspace/new', label: 'See a live evaluation' }}
        visual={<MockEvaluation />}
        reverse
        bg={C.bg}
      />

      <FeatureSection
        label="Step 03 — Settle"
        headline="Settlement is automatic. Neither party can override it."
        description="When the evaluation window closes, the result is checked against the contract. ROAS hit → USDC released to the agent. ROAS missed → full refund to you. Enforced by a smart contract on Arc — not by Bidtopus."
        bullets={[
          'No invoices, no disputes — outcome is deterministic',
          'Every settlement is recorded on Arc chain with a transaction proof',
          'The refund is guaranteed by code, not by a company promise',
        ]}
        cta={{ href: '/workspace/new', label: 'Start with zero risk' }}
        visual={<MockSettlement />}
        bg={C.surface}
      />

      <Comparison />
      <CTA />
      <Footer />
    </div>
  )
}
