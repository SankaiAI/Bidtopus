'use client'
import React, { useState } from 'react'
import Link from 'next/link'
import { useClerk, useUser } from '@clerk/nextjs'
import { useTheme } from '@/components/AppShell'
import { Icon } from './icons'

const GREEN  = 'var(--c-green)'
const THEMES = ['Light', 'Dark']

export default function UserProfile({ collapsed, connected, address, onDisconnect }) {
  const [panelOpen, setPanelOpen] = useState(false)
  const { isDark, toggleTheme } = useTheme()
  const { signOut, openSignIn } = useClerk()
  const { user, isSignedIn } = useUser()
  const containerRef = React.useRef(null)
  const addr = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : '0x…'

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
    const isProtected = path.startsWith('/contracts') ||
                        (path.startsWith('/workspace') && path !== '/workspace/new') ||
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

      {panelOpen && (
        <div style={{
          position: 'absolute', bottom: 'calc(100% + 4px)', left: '8px', right: '8px',
          border: '1px solid var(--c-border)', borderRadius: '12px', background: 'var(--c-bg)',
          overflow: 'hidden', zIndex: 20,
          boxShadow: '0 -4px 20px rgba(14,13,26,0.08)',
        }}>
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

          {connected && (
            <button
              onClick={() => { setPanelOpen(false); onDisconnect() }}
              style={panelRowStyle}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--c-sidebar-border-s)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <span style={{ color: 'var(--c-sidebar-muted)', display: 'flex' }}><Icon.Shield /></span>
              Disconnect wallet
            </button>
          )}

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
