'use client'
import React, { useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './icons'

const ACCENT = 'var(--c-indigo)'
const GREEN  = 'var(--c-green)'

const ESCROW_TOOLTIP = 'Your ad budget is locked in a tamper-proof smart contract on Arc. Funds are only released when your agreed performance target (e.g. ROAS) is met — if the campaign underperforms, unspent funds are returned to you.'

export default function EscrowProtect({ collapsed, walletConnected, isConnecting, error, onConnect }) {
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
        <>
          <button
            onClick={onConnect}
            disabled={isConnecting}
            style={{ width: '100%', marginTop: '6px', padding: '8px', borderRadius: '8px', border: '1px solid var(--c-border)', background: 'var(--c-indigo-subtle)', color: ACCENT, fontSize: '14px', fontWeight: 700, cursor: isConnecting ? 'wait' : 'pointer', opacity: isConnecting ? 0.6 : 1, fontFamily: 'Plus Jakarta Sans, sans-serif', transition: 'background 0.15s' }}
            onMouseEnter={e => { if (!isConnecting) e.currentTarget.style.background = 'var(--c-indigo-bg)' }}
            onMouseLeave={e => { if (!isConnecting) e.currentTarget.style.background = 'var(--c-indigo-subtle)' }}
          >
            {isConnecting ? 'Connecting…' : 'Connect Wallet'}
          </button>
          {error && (
            <div style={{ marginTop: '6px', padding: '6px 8px', borderRadius: '6px', background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: '11px', fontFamily: 'Plus Jakarta Sans, sans-serif', lineHeight: 1.4 }}>
              {error}
            </div>
          )}
        </>
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
