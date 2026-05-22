'use client'
import React, { useState, useEffect, useLayoutEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Logo from '@/components/Logo'
import { useTheme } from '@/components/AppShell'
import { generateSessionId } from '@/lib/workspaceSessions'
import { useWalletConnect } from '@/hooks/useWalletConnect'
import { useMetaAccount, accountLabel } from '@/contexts/MetaAccountContext'
import { Icon, PanelClose, PanelOpen } from './sidebar/icons'
import EscrowProtect from './sidebar/EscrowProtect'
import UserProfile from './sidebar/UserProfile'
import WorkspaceList from './sidebar/WorkspaceList'

// `protected: true` disables prefetch so unauthenticated visits don't trigger
// a cross-origin prefetch to Clerk's sign-in (would trip CORS).
const PRODUCTS = [
  { id: 'dashboard',    label: 'Dashboard',    href: '/dashboard',     Icon: Icon.Home },
  { id: 'contracts',    label: 'My Contracts', href: '/contracts',     Icon: Icon.Contract, protected: true },
  { id: 'new-contract', label: 'New Workspace', href: '/workspace/new', Icon: Icon.Plus, isAction: true },
]

const S = {
  navScroll:  { flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 },
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
  const { accounts, activeAccount, loading, setActiveAccount } = useMetaAccount()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = React.useRef(null)
  const filtered = accounts.filter(a => accountLabel(a).toLowerCase().includes(search.toLowerCase()))
  const selectedLabel = activeAccount ? accountLabel(activeAccount) : null

  React.useEffect(() => {
    if (!open) return
    function handleClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  if (collapsed) {
    return (
      <div
        title={selectedLabel || 'Select Meta Ads account'}
        onClick={() => setOpen(v => !v)}
        style={{ width: '56px', height: '48px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: 'transparent', transition: 'background 0.15s' }}
        onMouseEnter={e => e.currentTarget.style.background = '#f9f9fb'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        <Icon.Meta />
      </div>
    )
  }

  const placeholder = loading ? 'Loading accounts…'
    : accounts.length === 0 ? 'No connected accounts'
    : 'Select account'

  return (
    <div ref={containerRef} style={{ padding: '8px 12px 10px', flexShrink: 0 }}>
      <div style={{ position: 'relative' }}>
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
            {selectedLabel || placeholder}
          </span>
          <span style={{ color: '#a8a5b8', display: 'flex', flexShrink: 0, transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
            <Icon.ChevronDown />
          </span>
        </button>

        {open && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 30,
            background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderTop: 'none',
            borderRadius: '0 0 8px 8px', overflow: 'hidden',
            boxShadow: '0 8px 24px rgba(14,13,26,0.10)',
          }}>
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

            <div style={{ padding: '10px 12px' }}>
              {filtered.length === 0 ? (
                <p style={{ fontSize: '14px', color: '#a8a5b8', fontFamily: 'Plus Jakarta Sans, sans-serif', margin: 0 }}>
                  {accounts.length === 0 ? 'No Meta Ads accounts connected yet.' : 'No accounts match.'}
                </p>
              ) : filtered.map(a => {
                const isSelected = activeAccount?.id === a.id
                return (
                  <div
                    key={a.id}
                    onClick={() => { setActiveAccount(a); setOpen(false) }}
                    style={{ padding: '8px', fontSize: '14px', color: isSelected ? 'var(--c-indigo)' : 'var(--c-sub)', fontWeight: isSelected ? 600 : 500, cursor: 'pointer', borderRadius: '6px', fontFamily: 'Plus Jakarta Sans, sans-serif', transition: 'background 0.12s', display: 'flex', alignItems: 'center', gap: '8px' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--c-sidebar-hover)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <span style={{ flex: 1 }}>{accountLabel(a)}</span>
                    {isSelected && (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    )}
                  </div>
                )
              })}
            </div>

            <div style={{ borderTop: '1px solid #f0eef8' }}>
              <button
                onClick={() => {}}
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

// ─── NAV ITEM ─────────────────────────────────────────────────────────────────
function NavItem({ item, active, collapsed, onNavigate }) {
  const router = useRouter()
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

  const handleAction = (e) => {
    zoomOut(e)
    onNavigate?.()
    router.push(`/workspace/${generateSessionId()}`)
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

  const prefetch = item.protected ? false : undefined

  if (collapsed) {
    return (
      <Link
        href={item.href} title={item.label} onClick={onNavigate} prefetch={prefetch}
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
      href={item.href} onClick={onNavigate} prefetch={prefetch}
      style={{ ...baseStyle, gap: '10px', padding: '8px 10px' }}
      onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--c-sidebar-hover)'; zoomIn(e) }}
      onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = bgColor; zoomOut(e) }}
    >
      <span data-icon style={{ ...iconStyle, color: iconColor }}><item.Icon /></span>
      <span style={{ flex: 1, minWidth: 0 }}>{item.label}</span>
    </Link>
  )
}

// ─── LOGO ─────────────────────────────────────────────────────────────────────
function LogoWithTheme({ size }) {
  const { isDark } = useTheme()
  return <Logo color={isDark ? '#f0eff8' : '#0e0d1a'} size={size} />
}

// ─── SIDEBAR CONTENT ─────────────────────────────────────────────────────────
function SidebarContent({ activeItem, collapsed, onToggle, onNavigate }) {
  const { address, isConnected, isConnecting, error, connectAndLink, disconnect } = useWalletConnect()

  return (
    <>
      <div style={{
        height: '56px', padding: collapsed ? '0' : '0 16px',
        boxSizing: 'border-box',
        display: 'flex', alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'space-between',
        flexShrink: 0, background: 'var(--c-sidebar)',
        width: collapsed ? '56px' : '100%',
      }}>
        {!collapsed && <Link href="/" style={{ textDecoration: 'none' }}><LogoWithTheme size={17} /></Link>}
        <button onClick={onToggle} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} style={iconBtn} onMouseEnter={hoverOn} onMouseLeave={hoverOff}>
          {collapsed ? <PanelOpen /> : <PanelClose />}
        </button>
      </div>

      <MetaAccountSelector collapsed={collapsed} />

      <div style={S.navScroll}>
        <div style={{ padding: collapsed ? '8px 0 0' : '8px 10px 0', display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {!collapsed && <div style={S.sectionLbl}><span>Menu</span></div>}
          {collapsed && <div style={S.divider} />}
          {PRODUCTS.map(item => (
            <NavItem key={item.id} item={item} active={activeItem} collapsed={collapsed} onNavigate={onNavigate} />
          ))}
        </div>

        {!collapsed && <WorkspaceList />}
      </div>

      <EscrowProtect
        collapsed={collapsed}
        walletConnected={isConnected}
        isConnecting={isConnecting}
        error={error}
        onConnect={connectAndLink}
      />

      <UserProfile
        collapsed={collapsed}
        connected={isConnected}
        address={address}
        onDisconnect={disconnect}
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
          const saved = localStorage.getItem('bidtopus-sidebar-collapsed')
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
      localStorage.setItem('bidtopus-sidebar-collapsed', String(next))
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
