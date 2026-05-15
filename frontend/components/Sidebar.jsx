'use client'
import React, { useState, useEffect, useLayoutEffect } from 'react'
import Link from 'next/link'
import { createPortal } from 'react-dom'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth, useClerk, useUser } from '@clerk/nextjs'
import Logo from '@/components/Logo'
import { useTheme } from '@/components/AppShell'
import { getAllSessions, subscribeToSessions, generateSessionId, deleteSession } from '@/lib/workspaceSessions'
import { createApiClient } from '@/lib/api'

const ACCENT    = 'var(--c-indigo)'
const GREEN     = 'var(--c-green)'
const META_BLUE = '#1877F2'

// ─── ICONS ───────────────────────────────────────────────────────────────────
const Icon = {
  Home: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"/>
      <path d="M9 21V12h6v9"/>
    </svg>
  ),
  Contract: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
      <polyline points="10 9 9 9 8 9"/>
    </svg>
  ),
  Plus: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="8" x2="12" y2="16"/>
      <line x1="8" y1="12" x2="16" y2="12"/>
    </svg>
  ),
  Settings: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
    </svg>
  ),
  Wallet: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 7H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z"/>
      <path d="M16 3L8 7h12l-4-4z"/>
      <circle cx="17" cy="13" r="1" fill="currentColor" stroke="none"/>
    </svg>
  ),
  Shield: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  ),
  ChevronDown: () => (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  ),
  Support: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/>
      <circle cx="12" cy="17" r=".5" fill="currentColor"/>
    </svg>
  ),
  LogOut: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
      <polyline points="16 17 21 12 16 7"/>
      <line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  ),
  Meta: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill={META_BLUE}>
      <path d="M12 2C6.477 2 2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.879V14.89h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.989C18.343 21.129 22 16.99 22 12c0-5.523-4.477-10-10-10z"/>
    </svg>
  ),
  Search: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  ),
  MoreHorizontal: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/>
    </svg>
  ),
}

const PanelClose = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2"/>
    <path d="M9 3v18"/>
    <path d="M14 9l-3 3 3 3"/>
  </svg>
)

const PanelOpen = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2"/>
    <path d="M9 3v18"/>
    <path d="M13 9l3 3-3 3"/>
  </svg>
)

// ─── NAV STRUCTURE ────────────────────────────────────────────────────────────
const PRODUCTS = [
  { id: 'dashboard',    label: 'Dashboard',    href: '/dashboard',     Icon: Icon.Home },
  { id: 'contracts',    label: 'My Contracts', href: '/contracts',     Icon: Icon.Contract },
  { id: 'new-contract', label: 'New Contract', href: '/contracts/new', Icon: Icon.Plus, isAction: true },
]

const S = {
  navScroll:  { flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', minHeight: 0 },
  sectionLbl: { fontSize: '12px', fontWeight: 600, color: 'var(--c-sidebar-section)', textTransform: 'uppercase', letterSpacing: '0.07em', padding: '14px 8px 6px', fontFamily: 'Plus Jakarta Sans, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  divider:    { height: '1px', background: 'var(--c-sidebar-border-s)', margin: '10px 12px' },
}

const iconBtn = {
  background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-sidebar-muted)',
  padding: '5px', borderRadius: '6px', display: 'flex', alignItems: 'center',
  transition: 'background 0.15s, color 0.15s',
}
const hoverOn  = e => { e.currentTarget.style.background = 'var(--c-sidebar-active)'; e.currentTarget.style.color = 'var(--c-indigo)' }
const hoverOff = e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--c-sidebar-muted)' }

// ─── META ACCOUNT SELECTOR ────────────────────────────────────────────────────
function MetaAccountSelector({ collapsed }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const containerRef = React.useRef(null)
  const accounts = ['Shawn Zhou — Act #1234567']
  const filtered = accounts.filter(a => a.toLowerCase().includes(search.toLowerCase()))

  React.useEffect(() => {
    if (!open) return
    function handleClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  if (collapsed) {
    return (
      <div
        title={selected || 'Select Meta Ads account'}
        onClick={() => setOpen(v => !v)}
        style={{ width: '56px', height: '48px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: 'transparent', transition: 'background 0.15s' }}
        onMouseEnter={e => e.currentTarget.style.background = '#f9f9fb'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        <Icon.Meta />
      </div>
    )
  }

  return (
    <div ref={containerRef} style={{ padding: '8px 12px 10px', flexShrink: 0 }}>
      <div style={{ position: 'relative' }}>
        {/* Trigger button */}
        <button
          onClick={() => { setOpen(v => !v); setSearch('') }}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: '8px',
            padding: '8px 10px',
            borderRadius: open ? '8px 8px 0 0' : '8px',
            border: '1px solid var(--c-border)',
            borderBottom: open ? '1px solid var(--c-border-s)' : '1px solid var(--c-border)',
            background: 'var(--c-bg)', cursor: 'pointer', color: 'var(--c-sub)',
            fontSize: '14px', fontWeight: 500, fontFamily: 'Plus Jakarta Sans, sans-serif',
            textAlign: 'left',
          }}
        >
          <Icon.Meta />
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {selected || 'Select account'}
          </span>
          <span style={{ color: '#a8a5b8', display: 'flex', flexShrink: 0, transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
            <Icon.ChevronDown />
          </span>
        </button>

        {/* Dropdown */}
        {open && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 30,
            background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderTop: 'none',
            borderRadius: '0 0 8px 8px', overflow: 'hidden',
            boxShadow: '0 8px 24px rgba(14,13,26,0.10)',
          }}>
            {/* Search */}
            <div style={{ padding: '8px 10px', borderBottom: '1px solid #f0eef8' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px', background: 'var(--c-bg)', borderRadius: '7px', padding: '6px 10px' }}>
                <span style={{ color: '#a8a5b8', display: 'flex', flexShrink: 0 }}><Icon.Search /></span>
                <input
                  autoFocus
                  placeholder="Search ad accounts..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '14px', color: '#3d3c54', flex: 1, fontFamily: 'Plus Jakarta Sans, sans-serif', width: '100%', minWidth: 0 }}
                />
              </div>
            </div>

            {/* Results / empty state */}
            <div style={{ padding: '10px 12px' }}>
              {filtered.length === 0 ? (
                <p style={{ fontSize: '14px', color: '#a8a5b8', fontFamily: 'Plus Jakarta Sans, sans-serif', margin: 0 }}>No ad accounts found.</p>
              ) : filtered.map(a => (
                <div
                  key={a}
                  onClick={() => { setSelected(a); setOpen(false) }}
                  style={{ padding: '8px', fontSize: '14px', color: 'var(--c-sub)', cursor: 'pointer', borderRadius: '6px', fontFamily: 'Plus Jakarta Sans, sans-serif', transition: 'background 0.12s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--c-sidebar-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >{a}</div>
              ))}
            </div>

            {/* Connect new account */}
            <div style={{ borderTop: '1px solid #f0eef8' }}>
              <button
                onClick={() => setOpen(false)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '9px', padding: '10px 12px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: 600, color: 'var(--c-sub)', fontFamily: 'Plus Jakarta Sans, sans-serif', textAlign: 'left', transition: 'background 0.12s' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--c-sidebar-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <span style={{ fontSize: '18px', lineHeight: 1, color: '#6b6880', marginTop: '-1px' }}>+</span>
                Connect new account
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── NAV ITEMS ───────────────────────────────────────────────────────────────
function NavItem({ item, active, collapsed, onNavigate }) {
  const router = useRouter()
  // Action items (e.g. "New Contract") are never highlighted as active pages
  const isActive  = item.isAction ? false : active === item.id
  const textColor = isActive ? 'var(--c-indigo)' : 'var(--c-sidebar-text)'
  const iconColor = isActive ? 'var(--c-indigo)' : 'var(--c-sidebar-muted)'
  const bgColor   = isActive ? 'var(--c-sidebar-active)' : 'transparent'

  const baseStyle = {
    display: 'flex', alignItems: 'center', textDecoration: 'none',
    borderRadius: '8px', fontFamily: 'Plus Jakarta Sans, sans-serif',
    fontSize: '14px', fontWeight: 500, color: textColor,
    background: bgColor, cursor: 'pointer', transition: 'background 0.15s, color 0.15s',
    border: 'none',
  }
  const iconStyle = { display: 'inline-flex', flexShrink: 0, transition: 'transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1)' }
  const zoomIn  = e => { e.currentTarget.querySelector('span[data-icon]').style.transform = 'scale(1.25)' }
  const zoomOut = e => { e.currentTarget.querySelector('span[data-icon]').style.transform = 'scale(1)' }

  // Action items always create a fresh session
  const handleAction = (e) => {
    zoomOut(e)
    onNavigate?.()
    router.push(`${item.href}?session=${generateSessionId()}`)
  }

  if (item.isAction) {
    if (collapsed) {
      return (
        <button
          title={item.label} onClick={handleAction}
          style={{ ...baseStyle, width: '56px', justifyContent: 'center', padding: '9px 0' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--c-sidebar-hover)'; zoomIn(e) }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; zoomOut(e) }}
        >
          <span data-icon style={{ ...iconStyle, color: iconColor }}><item.Icon /></span>
        </button>
      )
    }
    return (
      <button
        onClick={handleAction}
        style={{ ...baseStyle, gap: '10px', padding: '8px 10px', width: '100%', textAlign: 'left' }}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--c-sidebar-hover)'; zoomIn(e) }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; zoomOut(e) }}
      >
        <span data-icon style={{ ...iconStyle, color: iconColor }}><item.Icon /></span>
        <span style={{ flex: 1, minWidth: 0 }}>{item.label}</span>
      </button>
    )
  }

  if (collapsed) {
    return (
      <Link
        href={item.href} title={item.label} onClick={onNavigate}
        style={{ ...baseStyle, width: '56px', justifyContent: 'center', padding: '9px 0' }}
        onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--c-sidebar-hover)'; zoomIn(e) }}
        onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; zoomOut(e) }}
      >
        <span data-icon style={{ ...iconStyle, color: iconColor }}><item.Icon /></span>
      </Link>
    )
  }

  return (
    <Link
      href={item.href} onClick={onNavigate}
      style={{ ...baseStyle, gap: '10px', padding: '8px 10px' }}
      onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--c-sidebar-hover)'; zoomIn(e) }}
      onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = bgColor; zoomOut(e) }}
    >
      <span data-icon style={{ ...iconStyle, color: iconColor }}><item.Icon /></span>
      <span style={{ flex: 1, minWidth: 0 }}>{item.label}</span>
    </Link>
  )
}

// ─── ESCROW PROTECT ───────────────────────────────────────────────────────────
const ESCROW_TOOLTIP = 'Your ad budget is locked in a tamper-proof smart contract on Arc. Funds are only released when your agreed performance target (e.g. ROAS) is met — if the campaign underperforms, unspent funds are returned to you.'

function EscrowProtect({ collapsed, walletConnected, onConnect }) {
  const active = walletConnected
  const [tooltipPos, setTooltipPos] = useState(null)
  const qBtnRef = React.useRef(null)

  const showTooltip = () => {
    if (!qBtnRef.current) return
    const rect = qBtnRef.current.getBoundingClientRect()
    setTooltipPos({ bottom: window.innerHeight - rect.top + 10, left: Math.max(8, rect.right - 220) })
  }

  if (collapsed) {
    return (
      <div
        title={active ? 'Escrow Protected — Active' : 'Connect wallet to activate escrow protection'}
        onClick={active ? undefined : onConnect}
        style={{ width: '56px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderTop: '1px solid #f0eef8', cursor: active ? 'default' : 'pointer' }}
      >
        <span style={{ color: active ? GREEN : '#c4c2d4', display: 'flex' }}><Icon.Shield /></span>
      </div>
    )
  }

  return (
    <div style={{ padding: '10px 12px', borderTop: '1px solid var(--c-sidebar-border-s)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '9px 11px', borderRadius: '9px', background: active ? 'var(--c-green-bg)' : 'var(--c-bg)' }}>
        <span style={{ color: active ? GREEN : 'var(--c-sidebar-faint)', display: 'flex' }}><Icon.Shield /></span>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '5px', minWidth: 0 }}>
          <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--c-sub)', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
            Escrow Protected
          </span>
          <button
            ref={qBtnRef}
            onMouseEnter={showTooltip}
            onMouseLeave={() => setTooltipPos(null)}
            style={{ width: '14px', height: '14px', borderRadius: '50%', border: '1.5px solid var(--c-sidebar-muted)', background: 'transparent', cursor: 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--c-sidebar-muted)', fontSize: '9px', fontWeight: 700, fontFamily: 'Plus Jakarta Sans, sans-serif', padding: 0, lineHeight: 1 }}
          >
            ?
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: active ? GREEN : 'var(--c-sidebar-faint)' }} />
          <span style={{ fontSize: '11px', fontWeight: 600, color: active ? GREEN : 'var(--c-sidebar-section)', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
            {active ? 'Active' : 'Inactive'}
          </span>
        </div>
      </div>
      {!active && (
        <button
          onClick={onConnect}
          style={{ width: '100%', marginTop: '6px', padding: '8px', borderRadius: '8px', border: '1px solid var(--c-border)', background: 'var(--c-indigo-subtle)', color: ACCENT, fontSize: '14px', fontWeight: 700, cursor: 'pointer', fontFamily: 'Plus Jakarta Sans, sans-serif', transition: 'background 0.15s' }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--c-indigo-bg)'}
          onMouseLeave={e => e.currentTarget.style.background = 'var(--c-indigo-subtle)'}
        >
          Connect Wallet
        </button>
      )}
      {tooltipPos && createPortal(
        <div style={{ position: 'fixed', bottom: tooltipPos.bottom, left: tooltipPos.left, width: '220px', background: '#1a192e', color: '#f0eff8', fontSize: '12px', fontFamily: 'Plus Jakarta Sans, sans-serif', lineHeight: 1.55, padding: '10px 13px', borderRadius: '9px', boxShadow: '0 6px 20px rgba(0,0,0,0.22)', zIndex: 9999, pointerEvents: 'none' }}>
          {ESCROW_TOOLTIP}
        </div>,
        document.body
      )}
    </div>
  )
}

// ─── USER PROFILE FOOTER ──────────────────────────────────────────────────────
const THEMES = ['Light', 'Dark']

function UserProfile({ collapsed, connected, onDisconnect }) {
  const [panelOpen, setPanelOpen] = useState(false)
  const { isDark, toggleTheme } = useTheme()
  const { signOut, openSignIn } = useClerk()
  const { user, isSignedIn } = useUser()
  const containerRef = React.useRef(null)
  const addr = '0x742d...4a8F'

  const displayName = isSignedIn
    ? (user.fullName || user.firstName || user.primaryEmailAddress?.emailAddress || 'Account')
    : 'Sign in'
  const initial = displayName[0]?.toUpperCase() || '?'

  React.useEffect(() => {
    if (!panelOpen) return
    function handleClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setPanelOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [panelOpen])

  const handleLogOut = async () => {
    setPanelOpen(false)
    onDisconnect()
    const path = window.location.pathname
    // Protected routes: /contracts/* (except /contracts/new) and /settings/*
    const isProtected = (path.startsWith('/contracts') && path !== '/contracts/new') ||
                         path.startsWith('/settings')
    await signOut({ redirectUrl: isProtected ? '/dashboard' : path })
  }

  const avatar = user?.imageUrl
    ? <img src={user.imageUrl} alt={displayName} style={{ width: '30px', height: '30px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
    : (
      <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: 'linear-gradient(135deg, #4F46E5, #6366F1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <span style={{ fontSize: '11px', fontWeight: 700, color: '#fff' }}>{initial}</span>
      </div>
    )

  if (collapsed) {
    return (
      <div
        title="Profile"
        onClick={() => setPanelOpen(v => !v)}
        style={{ width: '56px', height: '54px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', borderTop: '1px solid #f0eef8', transition: 'background 0.15s' }}
        onMouseEnter={e => e.currentTarget.style.background = '#f5f3ff'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        {avatar}
      </div>
    )
  }

  const panelRowStyle = {
    display: 'flex', alignItems: 'center', gap: '10px',
    padding: '9px 14px', textDecoration: 'none',
    color: 'var(--c-sub)', fontSize: '14px', fontWeight: 500,
    fontFamily: 'Plus Jakarta Sans, sans-serif', cursor: 'pointer',
    background: 'transparent', border: 'none', width: '100%', textAlign: 'left',
    transition: 'background 0.12s',
  }

  return (
    <div ref={containerRef} style={{ flexShrink: 0, position: 'relative' }}>
      {/* Footer row — always visible, sets the height of this component */}
      <div
        onClick={() => setPanelOpen(v => !v)}
        style={{ height: '54px', display: 'flex', alignItems: 'center', gap: '10px', padding: '0 12px', cursor: 'pointer', borderTop: '1px solid var(--c-sidebar-border-s)', transition: 'background 0.12s' }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--c-bg)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        {avatar}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--c-text)', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>{displayName}</div>
          <div style={{ fontSize: '11px', fontWeight: 500, color: connected ? GREEN : 'var(--c-sidebar-section)', fontFamily: 'Plus Jakarta Sans, sans-serif', marginTop: '1px' }}>
            {connected ? addr : 'Not connected'}
          </div>
        </div>
        <span style={{ color: '#a8a5b8', display: 'flex', transform: panelOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
          <Icon.ChevronDown />
        </span>
      </div>

      {/* Panel — absolutely positioned so it floats above without shifting layout */}
      {panelOpen && (
        <div style={{
          position: 'absolute', bottom: 'calc(100% + 4px)', left: '8px', right: '8px',
          border: '1px solid var(--c-border)', borderRadius: '12px', background: 'var(--c-bg)',
          overflow: 'hidden', zIndex: 20,
          boxShadow: '0 -4px 20px rgba(14,13,26,0.08)',
        }}>
          {/* Theme section */}
          <div style={{ padding: '11px 14px 10px' }}>
            <div style={{ marginBottom: '8px' }}>
              <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--c-sidebar-section)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Theme</span>
            </div>
            <div style={{ display: 'flex', gap: '4px' }}>
              {THEMES.map((t, i) => {
                const isSelected = i === 0 ? !isDark : isDark
                return (
                  <button
                    key={t}
                    onClick={() => { if (i === 0 ? isDark : !isDark) toggleTheme() }}
                    style={{ flex: 1, padding: '5px 0', borderRadius: '6px', border: '1px solid var(--c-border)', background: isSelected ? 'var(--c-surface)' : 'transparent', fontSize: '11px', fontWeight: isSelected ? 600 : 500, color: isSelected ? 'var(--c-sub)' : 'var(--c-sidebar-section)', cursor: 'pointer', fontFamily: 'Plus Jakarta Sans, sans-serif', transition: 'background 0.12s' }}
                  >
                    {t}
                  </button>
                )
              })}
            </div>
          </div>

          <div style={{ height: '1px', background: '#eceaf4' }} />

          <Link
            href="/settings"
            onClick={() => setPanelOpen(false)}
            style={{ ...panelRowStyle, display: 'flex' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--c-sidebar-border-s)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <span style={{ color: 'var(--c-sidebar-muted)', display: 'flex' }}><Icon.Settings /></span>
            Settings
          </Link>

          <div
            style={panelRowStyle}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--c-sidebar-border-s)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <span style={{ color: 'var(--c-sidebar-muted)', display: 'flex' }}><Icon.Support /></span>
            Support
          </div>

          <div style={{ height: '1px', background: 'var(--c-border)' }} />

          {isSignedIn ? (
            <button
              onClick={handleLogOut}
              style={{ ...panelRowStyle, color: '#ef4444' }}
              onMouseEnter={e => e.currentTarget.style.background = '#fff1f2'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <Icon.LogOut />
              Log out
            </button>
          ) : (
            <button
              onClick={() => { setPanelOpen(false); openSignIn({ afterSignInUrl: window.location.href }) }}
              style={{ ...panelRowStyle, color: 'var(--c-indigo)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--c-sidebar-border-s)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <span style={{ display: 'flex', transform: 'scaleX(-1)' }}><Icon.LogOut /></span>
              Sign in
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── WORKSPACE ───────────────────────────────────────────────────────────────
const MOCK_CONTRACTS = [
  { id: 'c1', title: 'Summer Sale — Retargeting', status: 'active', sub: 'ROAS 1.86× · 3 days left', href: '/workspace/c1', hasContract: true },
]

const WS_FILTERS = [
  { id: 'all',      label: 'All',      match: () => true },
  { id: 'active',   label: 'Active',   match: s => s.status === 'active' },
  { id: 'pending',  label: 'Pending',  match: s => s.status === 'negotiating' || s.status === 'pending_funding' || s.status === 'created' },
  { id: 'resolved', label: 'Resolved', match: s => s.status === 'success' || s.status === 'failure' },
]

const DOT_COLOR = {
  created:         { bg: '#F59E0B', pulse: false },
  active:          { bg: ACCENT,    pulse: true  },
  negotiating:     { bg: '#F59E0B', pulse: false },
  pending_funding: { bg: '#F59E0B', pulse: false },
  success:         { bg: '#10B981', pulse: false },
  failure:         { bg: '#a8a5b8', pulse: false },
}

function relativeTime(iso) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function Workspace() {
  const [filter, setFilter]             = useState('all')
  const [panelOpen, setPanelOpen]       = useState(false)
  const [sessions, setSessions]         = useState([])
  const [contracts, setContracts]       = useState(() => {
    // Seed from cache so sidebar shows last-known contracts immediately and
    // survives temporary backend 401s (DB pool exhaustion → token expiry cascade)
    try { return JSON.parse(localStorage.getItem('outcomex_contracts') || 'null') || [] } catch { return [] }
  })
  const [hoveredId, setHoveredId]       = useState(null)
  const [menuState, setMenuState]       = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [toast, setToast]               = useState(null)
  const { isSignedIn, isLoaded, getToken } = useAuth()
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    setSessions(getAllSessions())
    return subscribeToSessions(() => setSessions(getAllSessions()))
  }, [])

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return
    createApiClient(getToken).listContracts()
      .then(data => {
        const list = data || []
        setContracts(list)
        try { localStorage.setItem('outcomex_contracts', JSON.stringify(list)) } catch {}
      })
      .catch(() => {}) // keep last-cached list on failure
  }, [isLoaded, isSignedIn])

  useEffect(() => {
    if (!menuState) return
    const close = (e) => { if (!e.target.closest('[data-ws-menu]')) setMenuState(null) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [menuState])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  const activeSessionId = (pathname === '/contracts/new' && typeof window !== 'undefined')
    ? new URLSearchParams(window.location.search).get('session')
    : null
  const wsMatch = pathname.match(/^\/workspace\/([^/]+)/)
  const activeContractId = wsMatch ? wsMatch[1] : null

  // Server-authoritative Negotiating contracts, with localStorage title as fallback.
  // 'New conversation' / 'New Campaign' are stale placeholders — ignore them in favour of the API title.
  const PLACEHOLDER_TITLES = new Set(['New conversation', 'New Campaign', 'New negotiation', ''])
  const userTitle = (local) => {
    const t = local?.title
    return t && !PLACEHOLDER_TITLES.has(t) ? t : null
  }
  const sessionMap = new Map(sessions.map(s => [s.id, s]))
  const serverNegotiating = contracts
    .filter(c => c.status?.toLowerCase() === 'negotiating')
    .map(c => {
      const local = sessionMap.get(c.id)
      return {
        id: c.id,
        title: userTitle(local) || c.title || c.campaign_goal || 'New negotiation',
        status: 'negotiating',
        sub: relativeTime(c.created_at),
        href: `/contracts/new?session=${c.id}`,
        hasContract: true,
        _ts: c.created_at,
      }
    })

  // Created/pending_funding contracts — negotiation done, ready to fund escrow
  const serverFunded = contracts
    .filter(c => { const s = c.status?.toLowerCase(); return s === 'created' || s === 'pending_funding' })
    .map(c => {
      const local = sessionMap.get(c.id)
      return {
        id: c.id,
        title: userTitle(local) || c.title || c.campaign_goal || 'New Campaign',
        status: c.status?.toLowerCase(),
        sub: 'Ready to fund',
        href: `/workspace/${c.id}`,
        hasContract: true,
        _ts: c.created_at,
      }
    })

  // Legacy localStorage-only sessions (ws_xxx) not yet on the server
  const serverIds = new Set([...serverNegotiating, ...serverFunded].map(c => c.id))
  const localOnly = sessions
    .filter(s => !serverIds.has(s.id))
    .map(s => ({ id: s.id, title: s.title, status: 'negotiating', sub: relativeTime(s.createdAt), href: `/contracts/new?session=${s.id}`, hasContract: false, _ts: s.createdAt }))

  const allItems = [
    ...serverNegotiating,
    ...serverFunded,
    ...localOnly,
    ...MOCK_CONTRACTS,
  ].sort((a, b) => {
    if (!a._ts) return 1
    if (!b._ts) return -1
    return new Date(b._ts) - new Date(a._ts)
  })

  const current  = WS_FILTERS.find(f => f.id === filter)
  const filtered = allItems.filter(current.match)

  const openMenu = (e, item) => {
    e.preventDefault()
    e.stopPropagation()
    const rect = e.currentTarget.getBoundingClientRect()
    setMenuState({ item, right: window.innerWidth - rect.right, top: rect.bottom + 4 })
  }

  const handleDeleteClick = (item) => {
    setMenuState(null)
    if (!item.hasContract) {
      const wasActive = item.id === activeSessionId || item.id === activeContractId
      deleteSession(item.id)
      if (wasActive) router.push('/contracts/new')
    } else {
      setDeleteTarget(item)
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget || deleteLoading) return
    setDeleteLoading(true)
    try {
      await createApiClient(getToken).deleteContract(deleteTarget.id)
      const wasActive = deleteTarget.id === activeSessionId || deleteTarget.id === activeContractId
      deleteSession(deleteTarget.id)
      setContracts(prev => prev.filter(c => c.id !== deleteTarget.id))
      setDeleteTarget(null)
      if (wasActive) router.push('/contracts/new')
    } catch {
      setToast('Failed to delete workspace. Please try again.')
      setDeleteTarget(null)
    } finally {
      setDeleteLoading(false)
    }
  }

  return (
    <div style={{ padding: '0 10px' }}>
      <div style={{ position: 'relative' }}>
        <div style={S.sectionLbl}>
          <span>Workspace</span>
          <button
            onClick={() => setPanelOpen(v => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '11px', fontWeight: 600, color: panelOpen ? 'var(--c-indigo)' : 'var(--c-sidebar-section)', background: panelOpen ? 'var(--c-sidebar-active)' : 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', borderRadius: '6px', fontFamily: 'Plus Jakarta Sans, sans-serif', transition: 'background 0.12s, color 0.12s' }}
          >
            {current.label}
            <span style={{ display: 'flex', transform: panelOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.18s' }}><Icon.ChevronDown /></span>
          </button>
        </div>

        {panelOpen && (
          <div style={{ position: 'absolute', top: '100%', left: '0', right: '0', zIndex: 40, background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: '12px', boxShadow: '0 8px 24px rgba(14,13,26,0.10)', padding: '14px' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--c-sidebar-section)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'Plus Jakarta Sans, sans-serif', marginBottom: '8px' }}>Status</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {WS_FILTERS.map(f => {
                const selected = filter === f.id
                return (
                  <button
                    key={f.id}
                    onClick={() => { setFilter(f.id); setPanelOpen(false) }}
                    style={{ padding: '5px 12px', borderRadius: '20px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 600, fontFamily: 'Plus Jakarta Sans, sans-serif', background: selected ? 'var(--c-text)' : 'var(--c-border-s)', color: selected ? 'var(--c-surface)' : 'var(--c-muted)', transition: 'background 0.12s, color 0.12s' }}
                  >
                    {f.label}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {filtered.length === 0 ? (
        <div style={{ padding: '8px 8px 12px' }}>
          <p style={{ fontSize: '12px', color: 'var(--c-sidebar-section)', fontFamily: 'Plus Jakarta Sans, sans-serif', margin: 0 }}>No contracts match</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {filtered.map(item => {
            const dot      = DOT_COLOR[item.status] || DOT_COLOR.failure
            const isActive = item.id === activeSessionId || item.id === activeContractId
            const showBtn  = hoveredId === item.id || menuState?.item?.id === item.id
            return (
              <div
                key={item.id}
                style={{ position: 'relative', borderRadius: '8px', background: isActive ? '#eef2ff' : showBtn ? '#f5f3ff' : 'transparent', transition: 'background 0.12s' }}
                onMouseEnter={() => setHoveredId(item.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                <Link
                  href={item.href}
                  style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '7px 8px', paddingRight: showBtn ? '28px' : '8px', borderRadius: '8px', textDecoration: 'none', transition: 'padding-right 0.1s' }}
                >
                  <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: dot.bg, flexShrink: 0, marginTop: '5px', animation: dot.pulse ? 'agentThinkPulse 1.5s ease-in-out infinite' : 'none' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '14px', fontWeight: 500, color: isActive ? 'var(--c-indigo)' : 'var(--c-sidebar-text)', fontFamily: 'Plus Jakarta Sans, sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.title}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--c-sidebar-section)', fontFamily: 'Plus Jakarta Sans, sans-serif', marginTop: '1px' }}>
                      {item.sub}
                    </div>
                  </div>
                </Link>
                {showBtn && (
                  <button
                    data-ws-menu="btn"
                    onClick={(e) => openMenu(e, item)}
                    style={{ position: 'absolute', right: '4px', top: '50%', transform: 'translateY(-50%)', background: 'var(--c-sidebar-active)', border: 'none', cursor: 'pointer', color: 'var(--c-sidebar-muted)', padding: '3px 4px', borderRadius: '5px', display: 'flex', alignItems: 'center' }}
                  >
                    <Icon.MoreHorizontal />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {menuState && createPortal(
        <div
          data-ws-menu="dropdown"
          style={{ position: 'fixed', top: menuState.top, right: menuState.right, background: '#ffffff', border: '1px solid #e4e3ed', borderRadius: '8px', boxShadow: '0 4px 16px rgba(14,13,26,0.12)', zIndex: 9999, minWidth: '120px', overflow: 'hidden' }}
        >
          <button
            onClick={() => handleDeleteClick(menuState.item)}
            style={{ display: 'flex', alignItems: 'center', width: '100%', padding: '8px 14px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '14px', fontWeight: 500, color: '#ef4444', fontFamily: 'Plus Jakarta Sans, sans-serif', textAlign: 'left' }}
            onMouseEnter={e => e.currentTarget.style.background = '#fff1f2'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            Delete
          </button>
        </div>,
        document.body
      )}

      {deleteTarget && createPortal(
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)' }}
          onClick={(e) => { if (e.target === e.currentTarget && !deleteLoading) setDeleteTarget(null) }}
        >
          <div style={{ background: '#ffffff', borderRadius: '14px', padding: '24px', width: '360px', maxWidth: 'calc(100vw - 32px)', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
            <h3 style={{ margin: '0 0 8px', fontSize: '17px', fontWeight: 700, color: '#0e0d1a' }}>Delete workspace?</h3>
            <p style={{ margin: '0 0 20px', fontSize: '14px', color: '#6b6880', lineHeight: 1.5 }}>
              This workspace contains a contract. Deleting it will permanently remove all messages and the contract.
            </p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleteLoading}
                style={{ padding: '9px 18px', borderRadius: '8px', border: '1px solid #e4e3ed', background: '#ffffff', cursor: 'pointer', fontSize: '14px', fontWeight: 600, color: '#3d3c54', fontFamily: 'Plus Jakarta Sans, sans-serif' }}
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleteLoading}
                style={{ padding: '9px 18px', borderRadius: '8px', border: 'none', background: '#ef4444', cursor: deleteLoading ? 'wait' : 'pointer', fontSize: '14px', fontWeight: 600, color: '#ffffff', fontFamily: 'Plus Jakarta Sans, sans-serif', opacity: deleteLoading ? 0.7 : 1 }}
              >
                {deleteLoading ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {toast && createPortal(
        <div style={{ position: 'fixed', bottom: '20px', right: '20px', zIndex: 10001, background: '#ef4444', color: '#ffffff', padding: '12px 16px', borderRadius: '10px', fontSize: '14px', fontFamily: 'Plus Jakarta Sans, sans-serif', boxShadow: '0 4px 16px rgba(0,0,0,0.2)', maxWidth: '320px' }}>
          {toast}
        </div>,
        document.body
      )}
    </div>
  )
}

// ─── SIDEBAR CONTENT ─────────────────────────────────────────────────────────
function LogoWithTheme({ size }) {
  const { isDark } = useTheme()
  return <Logo color={isDark ? '#f0eff8' : '#0e0d1a'} size={size} />
}

function SidebarContent({ activeItem, collapsed, onToggle, onNavigate }) {
  const [walletConnected, setWalletConnected] = useState(false)

  return (
    <>
      {/* Header */}
      <div style={{
        height: '56px', padding: collapsed ? '0' : '0 16px',
        boxSizing: 'border-box',
        display: 'flex', alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'space-between',
        flexShrink: 0, background: 'var(--c-sidebar)',
        width: collapsed ? '56px' : '100%',
      }}>
        {!collapsed && <Link href="/landing" style={{ textDecoration: 'none' }}><LogoWithTheme size={17} /></Link>}
        <button onClick={onToggle} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} style={iconBtn} onMouseEnter={hoverOn} onMouseLeave={hoverOff}>
          {collapsed ? <PanelOpen /> : <PanelClose />}
        </button>
      </div>

      {/* Meta Ads account selector */}
      <MetaAccountSelector collapsed={collapsed} />

      {/* Scrollable nav */}
      <div style={S.navScroll}>
        {/* Products */}
        <div style={{ padding: collapsed ? '8px 0 0' : '8px 10px 0', display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {!collapsed && <div style={S.sectionLbl}><span>Menu</span></div>}
          {collapsed && <div style={S.divider} />}
          {PRODUCTS.map(item => (
            <NavItem key={item.id} item={item} active={activeItem} collapsed={collapsed} onNavigate={onNavigate} />
          ))}
        </div>

        {/* Workspace */}
        {!collapsed && <Workspace />}

        <div style={{ flex: 1 }} />
      </div>

      {/* Escrow protection status + wallet connect */}
      <EscrowProtect collapsed={collapsed} walletConnected={walletConnected} onConnect={() => setWalletConnected(true)} />

      {/* User profile footer with expandable panel */}
      <UserProfile
        collapsed={collapsed}
        connected={walletConnected}
        onDisconnect={() => setWalletConnected(false)}
      />
    </>
  )
}

// ─── MOBILE DRAWER ────────────────────────────────────────────────────────────
function MobileDrawerOverlay({ activeItem, onClose }) {
  const [closing, setClosing] = React.useState(false)
  const close = React.useCallback(() => { if (!closing) setClosing(true) }, [closing])
  return (
    <>
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 99, background: 'rgba(0,0,0,0.28)', animation: `sidebar-backdrop-${closing ? 'out' : 'in'} 0.26s ease ${closing ? 'forwards' : ''}` }}
        onClick={close}
      />
      <div
        style={{ position: 'fixed', left: 0, top: 0, width: '268px', height: '100svh', zIndex: 100, background: 'var(--c-sidebar)', borderRight: '1px solid var(--c-sidebar-border)', display: 'flex', flexDirection: 'column', overflow: 'hidden', animation: `sidebar-slide-${closing ? 'out' : 'in'} 0.26s cubic-bezier(0.4, 0, 0.2, 1) ${closing ? 'forwards' : ''}` }}
        onAnimationEnd={() => { if (closing) onClose() }}
      >
        <SidebarContent activeItem={activeItem} collapsed={false} onToggle={close} onNavigate={onClose} />
      </div>
    </>
  )
}

let _collapsedCache = null

// ─── MAIN EXPORT ─────────────────────────────────────────────────────────────
export default function Sidebar({ activeItem, onClose }) {
  const isMobileDrawer = !!onClose
  const [isMobile, setIsMobile] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [ready, setReady] = useState(false)

  useLayoutEffect(() => {
    const mobile = window.innerWidth < 768
    setIsMobile(mobile)
    if (!isMobileDrawer) {
      if (mobile) {
        setCollapsed(true)
      } else {
        if (_collapsedCache === null) {
          const saved = localStorage.getItem('outcomex-sidebar-collapsed')
          _collapsedCache = saved !== null ? saved === 'true' : false
        }
        setCollapsed(_collapsedCache)
      }
    }
    requestAnimationFrame(() => setReady(true))
  }, [isMobileDrawer])

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  function toggleCollapse() {
    if (isMobileDrawer) { onClose(); return }
    const next = !collapsed
    setCollapsed(next)
    if (!isMobile) {
      _collapsedCache = next
      localStorage.setItem('outcomex-sidebar-collapsed', String(next))
    }
  }

  if (isMobileDrawer) return <MobileDrawerOverlay activeItem={activeItem} onClose={onClose} />
  if (isMobile) return null

  return (
    <div style={{
      flexShrink: 0, height: '100vh', background: 'var(--c-sidebar)',
      borderRight: '1px solid var(--c-sidebar-border)', overflow: 'hidden',
      width: collapsed ? '56px' : '268px',
      transition: ready ? 'width 0.28s cubic-bezier(0.4, 0, 0.2, 1)' : 'none',
    }}>
      <div style={{ width: '268px', height: '100vh', background: 'var(--c-sidebar)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <SidebarContent activeItem={activeItem} collapsed={collapsed} onToggle={toggleCollapse} />
      </div>
    </div>
  )
}
