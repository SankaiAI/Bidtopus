'use client'
import React from 'react'
import { useOpenMobileSidebar } from '@/components/AppShell'
import { useMetaAccount, accountLabel } from '@/contexts/MetaAccountContext'
import { C, font } from './constants'

export default function WorkspaceHeader({ title, contractId, contractMetaAccountId, onTitleSave, onNew }) {
  const { accounts } = useMetaAccount()
  const contractAccount = contractMetaAccountId
    ? accounts.find(a => a.id === contractMetaAccountId)
    : null
  const openMobileSidebar = useOpenMobileSidebar()
  const [isEditing, setIsEditing] = React.useState(false)
  const [editValue, setEditValue] = React.useState('')
  const inputRef = React.useRef(null)

  const startEdit = () => {
    setEditValue(title)
    setIsEditing(true)
    setTimeout(() => inputRef.current?.select(), 0)
  }

  const commitEdit = () => {
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== title) onTitleSave?.(trimmed)
    setIsEditing(false)
  }

  return (
    <div className="agent-app-header" style={{ alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', height: '56px', background: C.surface, borderBottom: 'none', flexShrink: 0 }}>

      <button onClick={openMobileSidebar} className="app-mobile-menu-btn" style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.text, padding: '4px', display: 'none', alignItems: 'center', marginRight: '8px' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/><path d="M13 9l3 3-3 3"/></svg>
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, flex: 1 }}>
        {isEditing ? (
          <input
            ref={inputRef}
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commitEdit() } if (e.key === 'Escape') setIsEditing(false) }}
            style={{ fontSize: '14px', fontWeight: 700, color: C.text, fontFamily: font, border: 'none', borderBottom: `1.5px solid ${C.indigo}`, outline: 'none', background: 'transparent', minWidth: 0, flex: 1, maxWidth: '320px', padding: '1px 2px' }}
          />
        ) : (
          <>
            <span style={{ fontSize: '14px', fontWeight: 700, color: C.text, fontFamily: font, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
            {contractId && onTitleSave && (
              <button
                onClick={startEdit}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.faint, padding: '2px', display: 'flex', alignItems: 'center', flexShrink: 0, transition: 'color 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.color = C.muted}
                onMouseLeave={e => e.currentTarget.style.color = C.faint}
                title="Rename"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </button>
            )}
          </>
        )}
      </div>

      {contractAccount && (
        <span
          title={`This contract is scoped to ${accountLabel(contractAccount)}`}
          style={{ fontSize: '10px', fontWeight: 700, color: C.indigo, background: 'var(--c-indigo-subtle)', border: '1px solid var(--c-indigo-border)', padding: '3px 9px', borderRadius: '20px', fontFamily: font, whiteSpace: 'nowrap', flexShrink: 0, marginRight: '8px', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '180px' }}
        >
          {accountLabel(contractAccount)}
        </span>
      )}

      {onNew && (
        <button
          onClick={onNew}
          style={{ fontSize: '12px', fontWeight: 600, color: C.muted, background: 'none', border: `1px solid ${C.border}`, borderRadius: '7px', padding: '5px 12px', cursor: 'pointer', fontFamily: font, flexShrink: 0, transition: 'border-color 0.15s, color 0.15s' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = C.indigo; e.currentTarget.style.color = C.indigo }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.muted }}
        >
          + New
        </button>
      )}
    </div>
  )
}
