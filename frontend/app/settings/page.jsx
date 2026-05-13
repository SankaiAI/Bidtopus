'use client'
import React from 'react'
import Link from 'next/link'
import { useOpenMobileSidebar } from '@/components/AppShell'

const C = {
  bg:           'var(--c-bg)',
  surface:      'var(--c-surface)',
  border:       'var(--c-border)',
  borderS:      'var(--c-border-s)',
  text:         'var(--c-text)',
  sub:          'var(--c-sub)',
  muted:        'var(--c-muted)',
  faint:        'var(--c-faint)',
  indigo:       'var(--c-indigo)',
  green:        'var(--c-green)',
  amber:        'var(--c-amber)',
  indigoBg:     'var(--c-indigo-bg)',
  indigoBorder: 'var(--c-indigo-border)',
  greenBg:      'var(--c-green-bg)',
  greenBorder:  'var(--c-green-border)',
  amberBg:      'var(--c-amber-bg)',
}
const font = 'Plus Jakarta Sans, sans-serif'

function SettingsSection({ title, description, children }) {
  return (
    <div style={{ marginBottom: '32px' }}>
      <div style={{ marginBottom: '16px' }}>
        <h2 style={{ fontSize: '15px', fontWeight: 700, color: C.text, fontFamily: font, margin: 0 }}>{title}</h2>
        {description && (
          <p style={{ fontSize: '13px', color: C.muted, fontFamily: font, margin: '4px 0 0', lineHeight: 1.6 }}>{description}</p>
        )}
      </div>
      <div style={{ background: C.surface, borderRadius: '12px', border: `1px solid ${C.border}`, overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  )
}

function SettingsRow({ label, description, children, isLast }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '16px 20px', gap: '24px', borderBottom: isLast ? 'none' : `1px solid ${C.borderS}` }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: C.text, fontFamily: font }}>{label}</div>
        {description && (
          <div style={{ fontSize: '12px', color: C.muted, fontFamily: font, marginTop: '3px', lineHeight: 1.55 }}>{description}</div>
        )}
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  )
}

function ApprovalModeSelector({ value, onChange }) {
  const options = [
    {
      id: 'manual',
      label: 'Manual approve each step',
      description: 'Agent pauses before every Meta Ads action and waits for your explicit OK. You stay in full control of every campaign change.',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 11h1a3 3 0 0 1 0 6h-1" /><path d="M9 12v6" /><path d="M13 12v6" /><path d="M14 7.5c-1 0-1.44.5-3 .5s-2-.5-3-.5-1.72.5-2.5.5a2.5 2.5 0 0 1 0-5c.78 0 1.57.5 2.5.5.93 0 1.96-.5 3-.5s2 .5 3 .5 1.72-.5 2.5-.5a2.5 2.5 0 0 1 0 5c-.78 0-1.5-.5-2.5-.5z" />
        </svg>
      ),
    },
    {
      id: 'auto',
      label: 'Auto-approve agent actions',
      description: 'Agent executes ad actions automatically once your overall strategy is approved. Faster optimization with less friction.',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
      ),
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {options.map(opt => {
        const isSelected = value === opt.id
        return (
          <button
            key={opt.id}
            onClick={() => onChange(opt.id)}
            style={{
              display: 'flex', alignItems: 'flex-start', gap: '14px',
              padding: '14px 16px', borderRadius: '10px', textAlign: 'left', cursor: 'pointer',
              background: isSelected ? C.indigoBg : C.bg,
              border: `1.5px solid ${isSelected ? C.indigo : C.border}`,
              transition: 'border-color 0.15s, background 0.15s',
            }}
          >
            {/* Radio indicator */}
            <div style={{
              width: 18, height: 18, borderRadius: '50%', flexShrink: 0, marginTop: '1px',
              border: `2px solid ${isSelected ? C.indigo : C.faint}`,
              background: isSelected ? C.indigo : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {isSelected && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />}
            </div>
            {/* Icon */}
            <div style={{
              width: 32, height: 32, borderRadius: 8, flexShrink: 0,
              background: isSelected ? C.indigo : C.surface,
              color: isSelected ? '#fff' : C.muted,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: `1px solid ${isSelected ? 'transparent' : C.border}`,
            }}>
              {opt.icon}
            </div>
            {/* Text */}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: isSelected ? C.indigo : C.text, fontFamily: font, marginBottom: '3px' }}>{opt.label}</div>
              <div style={{ fontSize: '12px', color: C.muted, fontFamily: font, lineHeight: 1.55 }}>{opt.description}</div>
            </div>
          </button>
        )
      })}
    </div>
  )
}

export default function SettingsPage() {
  const openMobileSidebar = useOpenMobileSidebar()
  const [approvalMode, setApprovalMode] = React.useState('manual')
  const [saved, setSaved] = React.useState(false)

  React.useEffect(() => {
    const stored = localStorage.getItem('outcomex-approval-mode')
    if (stored === 'auto' || stored === 'manual') setApprovalMode(stored)
  }, [])

  function handleApprovalChange(mode) {
    setApprovalMode(mode)
    localStorage.setItem('outcomex-approval-mode', mode)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: C.bg }}>

      {/* Mobile header */}
      <div className="app-mobile-header">
        <button onClick={openMobileSidebar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.text, padding: '4px', display: 'flex', marginRight: '12px' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18" /><path d="M13 9l3 3-3 3" /></svg>
        </button>
        <span style={{ fontSize: '15px', fontWeight: 700, color: C.text, flex: 1, fontFamily: font }}>Settings</span>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ maxWidth: '640px', margin: '0 auto', padding: '32px 24px 48px' }}>

          {/* Page header */}
          <div style={{ marginBottom: '32px' }}>
            <h1 style={{ fontSize: '22px', fontWeight: 800, color: C.text, fontFamily: font, margin: '0 0 6px', letterSpacing: '-0.02em' }}>Settings</h1>
            <p style={{ fontSize: '13px', color: C.muted, fontFamily: font, margin: 0 }}>Configure how OutcomeX and your AI agent behave.</p>
          </div>

          {/* Agent execution section */}
          <SettingsSection
            title="Agent Execution"
            description="Control how your AI agent proceeds with Meta Ads actions during an active contract."
          >
            <div style={{ padding: '20px' }}>
              <ApprovalModeSelector value={approvalMode} onChange={handleApprovalChange} />
              {saved && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '12px', padding: '8px 12px', background: C.greenBg, borderRadius: '8px', border: `1px solid ${C.greenBorder}` }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
                  <span style={{ fontSize: '12px', color: C.green, fontWeight: 600, fontFamily: font }}>Saved</span>
                </div>
              )}
              <div style={{ marginTop: '14px', padding: '12px 14px', background: C.amberBg, borderRadius: '8px', border: `1px solid rgba(245,158,11,0.2)` }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.amber} strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0, marginTop: '1px' }}><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                  <p style={{ fontSize: '12px', color: C.sub, fontFamily: font, margin: 0, lineHeight: 1.6 }}>
                    <strong style={{ fontWeight: 700 }}>Safety note:</strong> Even in auto-approve mode, the agent presents a full strategy plan before your campaign launches. You always approve the overall strategy — only individual mid-campaign optimizations are auto-executed.
                  </p>
                </div>
              </div>
            </div>
          </SettingsSection>

          {/* Account section */}
          <SettingsSection title="Connected Accounts">
            <SettingsRow
              label="Meta Ads Account"
              description="The ad account your agent manages campaigns on."
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: C.green, flexShrink: 0 }} />
                <span style={{ fontSize: '12px', color: C.sub, fontFamily: font, fontWeight: 600 }}>act_1234567890</span>
              </div>
            </SettingsRow>
            <SettingsRow
              label="Wallet"
              description="USDC wallet used for escrow funding and settlement."
              isLast
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: C.green, flexShrink: 0 }} />
                <span style={{ fontSize: '12px', color: C.sub, fontFamily: font, fontWeight: 600 }}>0x4a7b...3e21</span>
              </div>
            </SettingsRow>
          </SettingsSection>

          {/* Notifications section */}
          <SettingsSection title="Notifications">
            <SettingsRow
              label="Agent updates"
              description="Daily progress reports while a contract is active."
            >
              <div style={{
                width: 38, height: 22, borderRadius: 11, cursor: 'pointer',
                background: C.indigo, position: 'relative', flexShrink: 0,
              }}>
                <div style={{ width: 16, height: 16, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, right: 3, boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
              </div>
            </SettingsRow>
            <SettingsRow
              label="Approval requests"
              description="Notifications when the agent needs your approval to proceed."
            >
              <div style={{
                width: 38, height: 22, borderRadius: 11, cursor: 'pointer',
                background: C.indigo, position: 'relative', flexShrink: 0,
              }}>
                <div style={{ width: 16, height: 16, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, right: 3, boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
              </div>
            </SettingsRow>
            <SettingsRow
              label="Contract settlement"
              description="Alert when a contract resolves and USDC is released or refunded."
              isLast
            >
              <div style={{
                width: 38, height: 22, borderRadius: 11, cursor: 'pointer',
                background: C.indigo, position: 'relative', flexShrink: 0,
              }}>
                <div style={{ width: 16, height: 16, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, right: 3, boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
              </div>
            </SettingsRow>
          </SettingsSection>

          {/* Footer */}
          <div style={{ paddingTop: '8px', borderTop: `1px solid ${C.borderS}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '11px', color: C.faint, fontFamily: font }}>OutcomeX · Hackathon MVP</span>
            <Link href="/contracts" style={{ fontSize: '12px', color: C.indigo, fontWeight: 600, textDecoration: 'none', fontFamily: font }}>← Back to contracts</Link>
          </div>

        </div>
      </div>
    </div>
  )
}
