'use client'
import React from 'react'
import Link from 'next/link'
import Image from 'next/image'
import Logo from '@/components/Logo'
import { SiMeta } from 'react-icons/si'

// ─── Design tokens (Bidtopus design system) ─────────────────────────────────
const S = {
  fontSans: '"DM Sans", Inter, "Helvetica Neue", Helvetica, Arial, sans-serif',
  cyan:     '#3daeff',
  cyanDeep: '#1d8fe6',
  cyanSoft: '#e8f5ff',
  ink:      '#0a0a0a',
  charcoal: '#222222',
  slate:    '#45515e',
  stone:    '#8e8e93',
  canvas:   '#ffffff',
  surface:  '#f7f8fa',
  hairline: '#e5e7eb',
  hairlineSoft: '#eaecf0',
  success:  '#1ba673',
  successBg:'#e8ffea',
}

// ─── Reusable primitives ─────────────────────────────────────────────────────
const Wrap = ({ children, style }) => (
  <div className="wrap" style={{ maxWidth: 1280, margin: '0 auto', padding: '0 40px', ...style }}>
    {children}
  </div>
)

function PrimaryBtn({ href, children, style }) {
  return (
    <Link href={href} style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      gap: 8, font: `600 14px/1.4 ${S.fontSans}`,
      padding: '14px 26px', borderRadius: 9999,
      background: S.ink, color: '#fff', textDecoration: 'none',
      whiteSpace: 'nowrap', transition: 'background 150ms ease',
      ...style,
    }}
      onMouseEnter={e => e.currentTarget.style.background = S.charcoal}
      onMouseLeave={e => e.currentTarget.style.background = (style?.background ?? S.ink)}
    >
      {children}
    </Link>
  )
}

function OutlineBtn({ href, children, style }) {
  return (
    <Link href={href} style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      gap: 8, font: `600 14px/1.4 ${S.fontSans}`,
      padding: '14px 26px', borderRadius: 9999,
      background: 'transparent', color: S.ink,
      border: `1px solid ${S.ink}`, textDecoration: 'none',
      whiteSpace: 'nowrap', transition: 'background 150ms ease',
      ...style,
    }}
      onMouseEnter={e => e.currentTarget.style.background = S.surface}
      onMouseLeave={e => e.currentTarget.style.background = (style?.background ?? 'transparent')}
    >
      {children}
    </Link>
  )
}

// ─── Nav ─────────────────────────────────────────────────────────────────────
function Navbar() {
  const [open, setOpen] = React.useState(false)
  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 50,
      background: 'rgba(255,255,255,0.88)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
    }}>
      <Wrap>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 72 }}>
          {/* Logo */}
          <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
            <Logo color={S.ink} size={18} />
          </Link>

          <nav className="bt-nav-links" />

          {/* Right CTAs */}
          <div className="bt-nav-right" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <PrimaryBtn href="/dashboard">Dashboard</PrimaryBtn>
          </div>

          {/* Mobile hamburger */}
          <button className="bt-hamburger" onClick={() => setOpen(v => !v)} style={{
            display: 'none', background: 'none', border: 'none',
            cursor: 'pointer', color: S.ink, padding: 4,
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              {open ? <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></> : <><line x1="3" y1="7" x2="21" y2="7"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="17" x2="21" y2="17"/></>}
            </svg>
          </button>
        </div>

        {/* Mobile drawer */}
        {open && (
          <div className="bt-mobile-menu" style={{ borderTop: `1px solid ${S.hairline}`, padding: '16px 0 20px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <PrimaryBtn href="/dashboard" style={{ marginTop: 8, justifyContent: 'center' }}>Dashboard</PrimaryBtn>
          </div>
        )}
      </Wrap>
    </header>
  )
}

// ─── Hero ─────────────────────────────────────────────────────────────────────
function Hero() {
  return (
    <section className="hero-section" style={{ position: 'relative', padding: '88px 0 56px', overflow: 'hidden' }}>
      {/* Cyan grid backdrop */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: `linear-gradient(to right, rgba(61,174,255,0.07) 1px, transparent 1px), linear-gradient(to bottom, rgba(61,174,255,0.07) 1px, transparent 1px)`,
        backgroundSize: '64px 64px',
        maskImage: 'radial-gradient(ellipse 70% 60% at 50% 40%, #000 30%, transparent 80%)',
        WebkitMaskImage: 'radial-gradient(ellipse 70% 60% at 50% 40%, #000 30%, transparent 80%)',
      }} />
      {/* Atmospheric glow */}
      <div style={{
        position: 'absolute', top: '-10%', left: '-5%', right: '-5%', height: '80%', pointerEvents: 'none',
        background: 'radial-gradient(ellipse 50% 55% at 50% 35%, rgba(61,174,255,0.22) 0%, rgba(61,174,255,0.06) 40%, transparent 70%)',
      }} />

      <Wrap>
        <div style={{ position: 'relative', textAlign: 'center' }}>
          {/* Blue octopus logo — kept from existing design */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 32 }}>
            <Image
              src="/icon-512.png"
              alt="Bidtopus"
              width={128}
              height={128}
              style={{ width: 128, height: 128, objectFit: 'contain' }}
              priority
            />
          </div>

          <h1 className="hero-h1" style={{
            font: `800 52px/1.08 ${S.fontSans}`,
            letterSpacing: '-1.6px',
            margin: '0 auto',
            maxWidth: 980,
            color: S.ink,
          }}>
            Your AI agent for Meta Ads
            <span style={{
              display: 'block',
              background: `linear-gradient(180deg, ${S.cyan} 0%, ${S.cyanDeep} 100%)`,
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>
              Paid only when it delivers
            </span>
          </h1>

          <p style={{
            font: `400 18px/1.55 ${S.fontSans}`,
            color: S.slate,
            maxWidth: 560,
            margin: '28px auto 0',
          }}>
            Set a ROAS target. The agent evaluates if it can hit it, runs your campaign, and collects its fee only after the result is verified.
          </p>

          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 36 }} className="hero-ctas">
            <PrimaryBtn href="/dashboard">Get started free</PrimaryBtn>
          </div>
        </div>
      </Wrap>
    </section>
  )
}

// ─── Brand logos (real assets, grayscale at rest → brand color on hover) ──────
function ArcLogoMark({ size = 22 }) {
  return (
    <svg width={size} height={size * (32 / 31)} viewBox="0 0 31 32" fill="none" aria-hidden="true">
      <path fill="currentColor" d="M0 32C0.260374 24.166 1.59328 16.8547 3.82135 11.1696C6.64316 3.96673 10.728 0 15.3227 0C19.9174 0 24.0016 3.96673 26.824 11.1696C28.292 14.9157 29.372 19.3668 30.0119 24.2089C30.0691 24.6414 30.1178 25.0809 30.1678 25.5195C30.184 25.5466 30.1938 25.5718 30.1905 25.5923C30.1905 25.5923 30.5666 27.9326 30.6465 32H30.604C30.0462 31.5439 23.4681 26.3931 12.5636 27.8845C12.7282 26.0457 12.9544 24.2565 13.2467 22.5415C13.2617 22.4538 13.2789 22.3692 13.2942 22.2821C17.5711 22.1536 21.3146 22.6486 24.1853 23.2972C24.1746 23.2293 24.1657 23.1594 24.1547 23.0918C23.5647 19.4302 22.6941 16.0779 21.5717 13.2131C19.7364 8.52888 17.3416 5.61852 15.3227 5.61852C13.3038 5.61852 10.909 8.52888 9.07379 13.2131C8.62954 14.3462 8.22512 15.5545 7.86244 16.8291C7.35258 18.615 6.92424 20.5296 6.58214 22.5413C6.0758 25.5124 5.75944 28.6987 5.64292 32H0Z"/>
    </svg>
  )
}

function TrustItem({ href, children, label }) {
  const [hover, setHover] = React.useState(false)
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 10,
        textDecoration: 'none',
        color: hover ? S.ink : S.stone,
        filter: hover ? 'none' : 'grayscale(1) opacity(0.6)',
        transition: 'color 0.2s, filter 0.2s',
      }}
    >
      {children}
      {label && <span style={{ font: `700 13px/1 ${S.fontSans}`, letterSpacing: '-0.01em' }}>{label}</span>}
    </a>
  )
}

// ─── Trust strip ─────────────────────────────────────────────────────────────
function TrustStrip() {
  return (
    <section style={{ padding: '32px 0 88px', textAlign: 'center' }}>
      <Wrap>
        <div style={{ font: `500 14px/1.5 ${S.fontSans}`, color: S.stone, marginBottom: 24, letterSpacing: '0.02em' }}>
          Built with
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 48, flexWrap: 'wrap' }}>
          <TrustItem href="https://www.facebook.com/business/ads" label="Meta Ads">
            <SiMeta size={22} color="#0866FF" />
          </TrustItem>
          <TrustItem href="https://www.circle.com/">
            <img src="/logos/circle.avif" alt="Circle" style={{ display: 'block', height: 22, width: 'auto' }} />
          </TrustItem>
          <TrustItem href="https://arc.io/" label="Arc Chain">
            <ArcLogoMark size={22} />
          </TrustItem>
        </div>
      </Wrap>
    </section>
  )
}

// ─── Mission ─────────────────────────────────────────────────────────────────
function Mission() {
  return (
    <section style={{ marginBottom: 96 }}>
      <Wrap>
        <div className="mission-card" style={{
          background: S.surface, borderRadius: 32, padding: '80px 64px',
          position: 'relative', overflow: 'hidden',
        }}>
          {/* Grid texture */}
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            backgroundImage: `linear-gradient(to right, rgba(10,10,10,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(10,10,10,0.04) 1px, transparent 1px)`,
            backgroundSize: '48px 48px',
          }} />
          <div className="mission-row" style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 64, alignItems: 'end' }}>
            <div>
              <h2 className="mission-h2" style={{ font: `600 64px/1.05 ${S.fontSans}`, letterSpacing: '-2px', color: S.ink, margin: 0 }}>
                Stake the outcome.{' '}
                <span style={{ color: S.cyanDeep, fontStyle: 'italic', fontWeight: 500, display: 'block' }}>
                  Skip the retainer.
                </span>
              </h2>
            </div>
            <div>
              <p style={{ font: `400 16px/1.6 ${S.fontSans}`, color: S.slate, marginBottom: 24 }}>
                Ad agencies charge whether you grow or not. Bidtopus signs a smart contract for a target ROAS, locks its own fee in escrow, and only collects when the agent delivers — verifiable on-chain.
              </p>
              <OutlineBtn href="#" style={{ background: S.canvas }}>Read the manifesto →</OutlineBtn>
            </div>
          </div>
        </div>
      </Wrap>
    </section>
  )
}

// ─── Arms grid ───────────────────────────────────────────────────────────────
const ARMS = [
  {
    num: '01.', accent: false,
    icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 9h18M7 14h4M7 17h6"/></svg>,
    title: 'Bid', accentTitle: 'smarter.',
    body: 'Real-time auction strategy across CPM, CPC, and conversion goals — adjusted every minute.',
  },
  {
    num: '02.', accent: false,
    icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="9" r="3"/><circle cx="17" cy="13" r="2.5"/><circle cx="7" cy="17" r="2"/><path d="M9 12v3M14 11l-3 1M15 14l-7 3"/></svg>,
    title: 'Target', accentTitle: 'audiences.',
    body: 'Lookalikes, retargeting cohorts, and creative-matched segments rotated automatically.',
  },
  {
    num: '03.', accent: true,
    icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20V8M10 20V4M16 20v-8M22 20v-5"/></svg>,
    title: 'Allocate', accentTitle: 'budget.',
    body: 'Spend rebalances toward winning campaigns the moment performance data crosses thresholds.',
  },
  {
    num: '04.', accent: true,
    icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="14" rx="2"/><path d="M3 17l5-5 4 4 4-4 5 5"/><circle cx="16" cy="8" r="1.5"/></svg>,
    title: 'Direct', accentTitle: 'creative.',
    body: 'Proposes copy and creative variants; you approve every change before it goes live.',
  },
]

function Arms() {
  const [hovered, setHovered] = React.useState(null)
  return (
    <section style={{ marginBottom: 96 }}>
      <Wrap>
        <div className="arms-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 40, gap: 64 }}>
          <h2 className="arms-h2" style={{ font: `600 56px/1.05 ${S.fontSans}`, letterSpacing: '-1.6px', maxWidth: 720, color: S.ink, margin: 0 }}>
            One agent.{' '}
            <span style={{ color: S.cyanDeep, fontStyle: 'italic', fontWeight: 500 }}>Eight arms.</span>
          </h2>
          <p style={{ maxWidth: 360, color: S.slate, font: `400 16px/1.55 ${S.fontSans}`, margin: 0 }}>
            Every arm of the agent runs asynchronously — adjusting campaigns, audiences, budget, and creative the moment Meta Ads gives it a signal.
          </p>
        </div>

        <div className="arms-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 20 }}>
          {ARMS.map((arm, i) => (
            <div key={i}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              style={{
                position: 'relative', background: S.canvas,
                border: `1px solid ${hovered === i ? S.cyan : S.hairline}`,
                borderRadius: 32, padding: '28px 24px 24px',
                minHeight: 280, display: 'flex', flexDirection: 'column',
                justifyContent: 'space-between', overflow: 'hidden',
                transition: 'border-color 200ms ease, transform 200ms ease',
                transform: hovered === i ? 'translateY(-2px)' : 'none',
              }}
            >
              <div style={{
                font: `600 88px/1 ${S.fontSans}`, letterSpacing: '-3px',
                color: arm.accent ? S.cyan : S.hairline, margin: 0,
              }}>
                {arm.num}
              </div>
              <div style={{ marginTop: 'auto' }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 8,
                  background: '#e8f5ff', color: S.cyanDeep,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: 16,
                }}>
                  {arm.icon}
                </div>
                <h3 style={{ font: `600 22px/1.25 ${S.fontSans}`, letterSpacing: '-0.5px', color: S.ink, margin: '0 0 6px' }}>
                  {arm.title} <span style={{ color: S.cyanDeep }}>{arm.accentTitle}</span>
                </h3>
                <p style={{ font: `400 14px/1.5 ${S.fontSans}`, color: S.slate, margin: 0 }}>{arm.body}</p>
              </div>
            </div>
          ))}
        </div>
      </Wrap>
    </section>
  )
}

// ─── Receipt / proof block ────────────────────────────────────────────────────
function Receipt() {
  return (
    <section style={{ marginBottom: 96 }}>
      <Wrap>
        <div className="receipt-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 64, alignItems: 'center' }}>
          {/* Copy */}
          <div className="receipt-copy">
            <h2 className="receipt-h2" style={{ font: `600 48px/1.1 ${S.fontSans}`, letterSpacing: '-1.4px', color: S.ink, margin: '0 0 24px' }}>
              Every result has{' '}
              <span style={{ color: S.cyanDeep, fontStyle: 'italic', fontWeight: 500 }}>a tx hash.</span>
            </h2>
            <p style={{ font: `400 16px/1.6 ${S.fontSans}`, color: S.slate, margin: '0 0 32px', maxWidth: 460 }}>
              Bidtopus measures success against the ROAS you contracted for, then settles in USDC the same way it locked the fee — through a Solidity escrow on Arc testnet, signed by the agent, verifiable by you.
            </p>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 16 }}>
              {[
                'Fee locked into escrow before the first ad runs',
                'ROAS evaluated against Meta Ads MCP feed',
                'Settlement or refund executes automatically',
              ].map((item, i) => (
                <li key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', font: `500 15px/1.5 ${S.fontSans}`, color: S.charcoal }}>
                  <span style={{
                    width: 22, height: 22, borderRadius: '50%', background: S.cyan,
                    color: S.ink, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 6.5l2.5 2.5 5.5-6"/></svg>
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Contract card mock */}
          <div style={{
            background: S.canvas, border: `1px solid ${S.hairline}`,
            borderRadius: 32, padding: 28,
            boxShadow: '0 0 22px 0 rgba(0,0,0,0.08)',
            position: 'relative', overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 80% 60% at 100% 0%, rgba(61,174,255,0.12) 0%, transparent 60%)', pointerEvents: 'none' }} />
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <span style={{ font: `600 14px/1 ${S.fontSans}`, color: S.stone, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Contract #4271 · Live</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: S.successBg, color: S.success, font: `700 11px/1 ${S.fontSans}`, letterSpacing: '0.08em', padding: '4px 10px', borderRadius: 9999 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: S.success }} />
                Active
              </span>
            </div>
            {/* Stats grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
              {[
                { label: 'Target ROAS', value: '≥ 2.0', unit: '× spend', dark: false },
                { label: 'Days remaining', value: '3', unit: '/ 7 days', dark: false },
                { label: 'Current ROAS', value: '2.34', unit: '×', dark: true, arrow: '↑ 17% probability lift' },
                { label: 'Success fee', value: '100', unit: 'USDC', dark: false },
              ].map((stat, i) => (
                <div key={i} style={{
                  background: stat.dark ? S.ink : S.surface,
                  borderRadius: 12, padding: 16,
                }}>
                  <div style={{ font: `500 12px/1 ${S.fontSans}`, color: stat.dark ? 'rgba(255,255,255,0.6)' : S.stone, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 8 }}>{stat.label}</div>
                  <div style={{ font: `600 28px/1 ${S.fontSans}`, letterSpacing: '-0.8px', color: stat.dark ? '#fff' : S.ink }}>
                    {stat.value}
                    <span style={{ fontSize: 14, color: stat.dark ? 'rgba(255,255,255,0.55)' : S.stone, marginLeft: 4, fontWeight: 500, letterSpacing: 0 }}>{stat.unit}</span>
                  </div>
                  {stat.arrow && <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: S.cyan, font: `600 13px/1 ${S.fontSans}`, marginTop: 8 }}>{stat.arrow}</div>}
                </div>
              ))}
            </div>
            {/* Sparkline */}
            <div style={{ background: S.surface, borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <div style={{ font: `500 12px/1 ${S.fontSans}`, color: S.stone, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 12 }}>ROAS, last 72 hours</div>
              <svg viewBox="0 0 320 64" preserveAspectRatio="none" style={{ width: '100%', height: 64, display: 'block' }}>
                <defs>
                  <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3daeff" stopOpacity="0.4"/>
                    <stop offset="100%" stopColor="#3daeff" stopOpacity="0"/>
                  </linearGradient>
                </defs>
                <path d="M0 50 L20 46 L40 48 L60 38 L80 42 L100 32 L120 36 L140 26 L160 30 L180 22 L200 24 L220 16 L240 20 L260 14 L280 10 L300 12 L320 6 L320 64 L0 64 Z" fill="url(#chartFill)"/>
                <path d="M0 50 L20 46 L40 48 L60 38 L80 42 L100 32 L120 36 L140 26 L160 30 L180 22 L200 24 L220 16 L240 20 L260 14 L280 10 L300 12 L320 6" stroke="#3daeff" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="320" cy="6" r="3.5" fill="#3daeff"/>
              </svg>
            </div>
            {/* Tx row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: S.canvas, border: `1px solid ${S.hairline}`, borderRadius: 12, padding: '12px 16px' }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: S.cyan, color: S.ink, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', font: `700 11px/1 ${S.fontSans}` }}>Ar</div>
              <div>
                <div style={{ font: `500 12px/1.3 ${S.fontSans}`, color: S.stone }}>Escrow tx · Arc testnet</div>
                <div style={{ fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace', fontSize: 13, color: S.ink, fontWeight: 500 }}>0x4a8d…7c12</div>
              </div>
              <div style={{ flex: 1 }} />
              <a href="#" style={{ color: S.cyanDeep, font: `500 13px/1 ${S.fontSans}`, textDecoration: 'none' }}>View ↗</a>
            </div>
          </div>
        </div>
      </Wrap>
    </section>
  )
}

// ─── How it works ─────────────────────────────────────────────────────────────
function HowItWorks() {
  return (
    <section style={{ padding: '80px 0', marginBottom: 96 }}>
      <Wrap>
        <div style={{ textAlign: 'center', marginBottom: 56 }}>
          <h2 className="flow-h2" style={{ font: `600 48px/1.1 ${S.fontSans}`, letterSpacing: '-1.4px', maxWidth: 680, margin: '0 auto', color: S.ink }}>
            Three steps.{' '}
            <span style={{ color: S.cyanDeep, fontStyle: 'italic', fontWeight: 500 }}>Zero retainer.</span>
          </h2>
        </div>
        <div className="flow-steps-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', position: 'relative' }}>
          {/* Dashed connector */}
          <div className="flow-line" style={{
            position: 'absolute', top: 28, left: '16%', right: '16%', height: 2,
            background: `repeating-linear-gradient(to right, ${S.cyan} 0 6px, transparent 6px 12px)`,
            zIndex: 0,
          }} />
          {[
            { n: '1', title: 'Set a target', body: 'Pick a ROAS, an evaluation window, and a success fee. The agent counter-offers if the odds need adjusting.' },
            { n: '2', title: 'Lock USDC', body: 'Fund a smart-contract escrow on Arc testnet through Circle App Kit. No card, no invoice, no retainer.' },
            { n: '3', title: 'Settle on-chain', body: 'If the agent hits the target the fee releases. If not, every cent returns to your wallet automatically.' },
          ].map((step, i) => (
            <div key={i} style={{ position: 'relative', padding: '0 24px', textAlign: 'center', zIndex: 1 }}>
              <div style={{
                width: 56, height: 56, borderRadius: '50%',
                background: S.canvas, border: `2px solid ${S.cyan}`,
                color: S.cyanDeep, font: `600 22px/1 ${S.fontSans}`,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: 20,
              }}>
                {step.n}
              </div>
              <h3 style={{ font: `600 20px/1.3 ${S.fontSans}`, letterSpacing: '-0.3px', color: S.ink, margin: '0 0 8px' }}>{step.title}</h3>
              <p style={{ color: S.slate, fontSize: 15, maxWidth: 280, margin: '0 auto' }}>{step.body}</p>
            </div>
          ))}
        </div>
      </Wrap>
    </section>
  )
}

// ─── Final CTA ────────────────────────────────────────────────────────────────
function FinalCTA() {
  return (
    <section style={{ marginBottom: 64 }}>
      <Wrap>
        <div className="cta-card" style={{
          background: S.ink, borderRadius: 32, padding: '80px 64px',
          color: '#fff', textAlign: 'center', position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 70% 80% at 50% 0%, rgba(61,174,255,0.5) 0%, rgba(61,174,255,0.08) 40%, transparent 70%)', pointerEvents: 'none' }} />
          <h2 className="cta-h2" style={{ font: `600 64px/1.05 ${S.fontSans}`, letterSpacing: '-2px', color: '#fff', maxWidth: 800, margin: '0 auto', position: 'relative' }}>
            Results first.
            <span style={{ color: S.cyan, fontStyle: 'italic', fontWeight: 500, display: 'block' }}>Then we get paid.</span>
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.65)', font: `400 18px/1.55 ${S.fontSans}`, maxWidth: 560, margin: '24px auto 36px', position: 'relative' }}>
            Negotiate the terms with the agent — ROAS target, budget, timeline. It runs your Meta Ads and collects its fee only after the result is verified on-chain.
          </p>
          <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', gap: 12 }} className="hero-ctas">
            <PrimaryBtn href="/dashboard" style={{ background: S.cyan, color: S.ink }}>
              Get started free
            </PrimaryBtn>
          </div>
          <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 16, marginTop: 28, color: 'rgba(255,255,255,0.55)', font: `400 13px/1 ${S.fontSans}` }}>
            <span>No card required</span>
            <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'rgba(255,255,255,0.3)' }} />
            <span>Setup in minutes</span>
          </div>
        </div>
      </Wrap>
    </section>
  )
}

// ─── Footer ───────────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer style={{ padding: '56px 0 40px' }}>
      <Wrap>
        <div className="ft-row" style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr', gap: 48, marginBottom: 48 }}>
          <div>
            <Logo color={S.ink} size={18} style={{ marginBottom: 16, display: 'block' }} />
            <p style={{ color: S.slate, fontSize: 14, maxWidth: 280 }}>
              Performance ad agency for ambitious merchants. AI-run, USDC-staked, Arc-settled.
            </p>
          </div>
          {[
            { heading: 'Product', links: ['Contract Builder','Underwriting','Escrow Funding','Live Monitoring','Resolution'] },
            { heading: 'Company', links: ['About','Careers','Press','Contact'] },
            { heading: 'Resources', links: ['Docs','Contract whitepaper','Arc explorer','Security','Changelog'] },
          ].map(col => (
            <div key={col.heading}>
              <h4 style={{ font: `600 13px/1 ${S.fontSans}`, color: S.stone, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 16 }}>{col.heading}</h4>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 12 }}>
                {col.links.map(link => (
                  <li key={link}>
                    <a href="#" style={{ color: S.charcoal, font: `400 14px/1.4 ${S.fontSans}`, textDecoration: 'none' }}
                      onMouseEnter={e => { e.currentTarget.style.color = S.cyanDeep }}
                      onMouseLeave={e => { e.currentTarget.style.color = S.charcoal }}
                    >
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div style={{ borderTop: `1px solid ${S.hairline}`, paddingTop: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: S.stone, font: `400 13px/1 ${S.fontSans}` }}>
          <span>© 2026 Bidtopus. Built for the Agora Hackathon.</span>
          <div style={{ display: 'flex', gap: 24 }}>
            {['Terms','Privacy','Disclosures','Status'].map(l => (
              <a key={l} href="#" style={{ color: S.stone, textDecoration: 'none' }}>{l}</a>
            ))}
          </div>
        </div>
      </Wrap>
    </footer>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function LandingPage() {
  return (
    <div style={{ fontFamily: S.fontSans, background: S.canvas, color: S.ink }}>
      <Navbar />
      <Hero />
      <TrustStrip />
      <Mission />
      <Arms />
      <Receipt />
      <HowItWorks />
      <FinalCTA />
      <Footer />

      {/* Responsive overrides */}
      <style>{`
        body { overflow-x: hidden; }

        @media (max-width: 900px) {
          .mission-row  { grid-template-columns: 1fr !important; gap: 32px !important; }
          .arms-head    { flex-direction: column !important; gap: 20px !important; }
          .arms-grid    { grid-template-columns: repeat(2,1fr) !important; }
          .receipt-row  { grid-template-columns: 1fr !important; gap: 40px !important; }
          .ft-row       { grid-template-columns: 1fr 1fr !important; gap: 32px !important; }
          .mission-card { padding: 48px 40px !important; }
          .cta-card     { padding: 64px 40px !important; }
        }

        @media (max-width: 640px) {
          /* Layout */
          .wrap         { padding: 0 20px !important; }
          .bt-nav-links { display: none !important; }
          .bt-nav-right { display: none !important; }
          .bt-hamburger { display: flex !important; }

          /* Hero */
          .hero-section { padding: 40px 0 36px !important; }
          .hero-h1      { font-size: 36px !important; letter-spacing: -1px !important; line-height: 1.1 !important; }

          /* Mission */
          .mission-card { padding: 36px 24px !important; border-radius: 20px !important; }
          .mission-h2   { font-size: 34px !important; letter-spacing: -1px !important; line-height: 1.1 !important; text-align: center !important; }
          .mission-row  { text-align: center !important; }
          .mission-row .bt-btn-tertiary { margin: 0 auto !important; }

          /* Arms */
          .arms-h2   { font-size: 30px !important; letter-spacing: -0.8px !important; text-align: center !important; }
          .arms-head { gap: 12px !important; margin-bottom: 24px !important; text-align: center !important; align-items: center !important; }
          .arms-head p { display: none !important; }
          .arms-grid { grid-template-columns: 1fr !important; }

          /* Receipt */
          .receipt-row  { grid-template-columns: 1fr !important; }
          .receipt-copy { text-align: center !important; }
          .receipt-h2   { font-size: 34px !important; letter-spacing: -1px !important; }
          .receipt-copy ul { text-align: left !important; }

          /* How it works */
          .flow-steps-grid { grid-template-columns: 1fr !important; gap: 36px !important; }
          .flow-line        { display: none !important; }
          .flow-h2          { font-size: 32px !important; letter-spacing: -0.8px !important; }

          /* CTA */
          .cta-card { padding: 48px 24px !important; border-radius: 20px !important; }
          .cta-h2   { font-size: 38px !important; letter-spacing: -1.2px !important; line-height: 1.1 !important; }

          /* Footer */
          .ft-row { grid-template-columns: 1fr !important; gap: 32px !important; }

          /* Hero CTAs */
          .hero-ctas { flex-direction: column !important; align-items: stretch !important; }
          .hero-ctas a { justify-content: center !important; }
        }
      `}</style>
    </div>
  )
}
