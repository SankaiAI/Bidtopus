'use client'
import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { createPortal } from 'react-dom'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@clerk/nextjs'
import { getAllSessions, subscribeToSessions, deleteSession } from '@/lib/workspaceSessions'
import { createApiClient } from '@/lib/api'
import { useMetaAccount } from '@/contexts/MetaAccountContext'
import { normalizeStatus, isAwaitingFund, isLive, isResolved } from '@/lib/contractStatus'
import { isUnread, requiresAction, getViewedMap, clearLastViewed } from '@/lib/contractActivity'
import { SidebarRowSkeleton } from '@/components/Skeleton'
import { Icon } from './icons'

// 30s belt-and-suspenders interval. Focus refetch handles "switched tabs and
// came back"; the interval catches users who keep the tab pinned and never
// re-focus, plus background status transitions like /accept → FundedPending
// or fund-escrow → Funded that flip a contract while they're looking at it.
const LIST_REFRESH_MS = 30_000

const ACCENT = 'var(--c-indigo)'

const sectionLbl = { fontSize: '12px', fontWeight: 600, color: 'var(--c-sidebar-section)', textTransform: 'uppercase', letterSpacing: '0.07em', padding: '14px 8px 6px', fontFamily: 'Plus Jakarta Sans, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }

const WS_FILTERS = [
  { id: 'all',      label: 'All',      match: () => true },
  { id: 'active',   label: 'Active',   match: s => isLive(s.status) },
  { id: 'pending',  label: 'Pending',  match: s => s.status === 'negotiating' || isAwaitingFund(s.status) },
  { id: 'resolved', label: 'Resolved', match: s => isResolved(s.status) },
]

// Visual treatment lives in the row render itself — no per-status color map.
// We only paint a leading dot when the agent is waiting on the merchant
// (amber, pulsing); status is communicated through subtitle text + the right-
// side badge instead of through dot color.

function relativeTime(iso) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

const PLACEHOLDER_TITLES = new Set(['New conversation', 'New Campaign', 'New negotiation', ''])
function userTitle(local) {
  const t = local?.title
  return t && !PLACEHOLDER_TITLES.has(t) ? t : null
}

export default function WorkspaceList() {
  const touchStartY = React.useRef(0)
  const touchMoved  = React.useRef(false)

  const [filter, setFilter]             = useState('all')
  const [panelOpen, setPanelOpen]       = useState(false)
  const [sessions, setSessions]         = useState([])
  const [contracts, setContracts]       = useState([])
  const [hasFetchedOnce, setHasFetchedOnce] = useState(false)
  const [fetchFailed, setFetchFailed]   = useState(false)
  const [hoveredId, setHoveredId]       = useState(null)
  const [menuState, setMenuState]       = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [toast, setToast]               = useState(null)
  const { isSignedIn, isLoaded, getToken } = useAuth()
  const { activeAccount, accounts, loading: accountsLoading } = useMetaAccount()
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    setSessions(getAllSessions())
    return subscribeToSessions(() => setSessions(getAllSessions()))
  }, [])

  // Restore cache only after Clerk confirms signed-in, otherwise an
  // unauthenticated tab would show the previous user's contracts (the localStorage
  // cache is per-browser, not per-Clerk-user). When Clerk transitions to
  // signed-out, blow away both the in-memory state and the cache so nothing
  // leaks across users on the same browser.
  useEffect(() => {
    if (!isLoaded) return
    if (!isSignedIn) {
      setContracts([])
      setHasFetchedOnce(false)
      setFetchFailed(false)
      try { localStorage.removeItem('bidtopus_contracts') } catch {}
      clearLastViewed()
      return
    }
    // Do NOT pre-load the localStorage cache here. We only show server data
    // after a successful fetch so stale cache is never surfaced when the
    // backend is unreachable.
  }, [isLoaded, isSignedIn])

  // Refetch the server contract list on mount, on window focus, every 30s,
  // and whenever the active Meta Ads account changes. On account switch we
  // clear immediately so the skeleton renders; background refetches (focus,
  // interval) are stale-while-revalidate so the list never flashes empty.
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return

    setContracts([])
    setHasFetchedOnce(false)

    const api = createApiClient(getToken)
    const opts = activeAccount?.id ? { metaAdsAccountId: activeAccount.id } : {}
    let cancelled = false

    const refetch = () => {
      api.listContracts(opts)
        .then(data => {
          if (cancelled) return
          const list = data || []
          setContracts(list)
          setFetchFailed(false)
          try { localStorage.setItem('bidtopus_contracts', JSON.stringify(list)) } catch {}
        })
        .catch(() => {
          if (cancelled) return
          // Backend unreachable — wipe any cached contracts so stale data from
          // a previous session is never shown to the signed-in user.
          setContracts([])
          setFetchFailed(true)
          try { localStorage.removeItem('bidtopus_contracts') } catch {}
        })
        .finally(() => { if (!cancelled) setHasFetchedOnce(true) })
    }

    refetch()
    const onFocus = () => refetch()
    window.addEventListener('focus', onFocus)
    const intervalId = setInterval(refetch, LIST_REFRESH_MS)

    return () => {
      cancelled = true
      window.removeEventListener('focus', onFocus)
      clearInterval(intervalId)
    }
  }, [isLoaded, isSignedIn, getToken, activeAccount?.id])

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

  const wsMatch = pathname.match(/^\/workspace\/([^/]+)/)
  const activeContractId = wsMatch ? wsMatch[1] : null

  const sessionMap = new Map(sessions.map(s => [s.id, s]))

  const serverNegotiating = contracts
    .filter(c => normalizeStatus(c.status) === 'negotiating')
    .map(c => {
      const local = sessionMap.get(c.id)
      return { id: c.id, title: userTitle(local) || c.title || c.campaign_goal || 'New negotiation', status: 'negotiating', sub: relativeTime(c.created_at), href: `/workspace/${c.id}`, hasContract: true, _ts: c.created_at, _raw: c }
    })

  const serverFunded = contracts
    .filter(c => isAwaitingFund(c.status))
    .map(c => {
      const local = sessionMap.get(c.id)
      return { id: c.id, title: userTitle(local) || c.title || c.campaign_goal || 'New Campaign', status: normalizeStatus(c.status), sub: 'Ready to fund', href: `/workspace/${c.id}`, hasContract: true, _ts: c.created_at, _raw: c }
    })

  const serverIds = new Set([...serverNegotiating, ...serverFunded].map(c => c.id))
  const localOnly = sessions
    .filter(s => !serverIds.has(s.id))
    // Hide sessions that were started under a different Meta account.
    // Sessions with no metaAccountId are pre-tagging legacy drafts — show them
    // only when no specific account is selected so they don't bleed across accounts.
    .filter(s => {
      if (!s.metaAccountId) return !activeAccount?.id
      return s.metaAccountId === activeAccount?.id
    })
    .map(s => ({ id: s.id, title: s.title, status: 'negotiating', sub: relativeTime(s.createdAt), href: `/workspace/${s.id}`, hasContract: false, _ts: s.createdAt }))

  // Privacy gate: never surface workspaces (server contracts, local drafts)
  // to an unauthenticated browser. Local drafts (`sessions`) are kept in
  // localStorage so the user doesn't lose them on sign-out, but they only
  // render once a Clerk session is active.
  const allItems = !isSignedIn ? [] : [
    ...serverNegotiating,
    ...serverFunded,
    ...localOnly,
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
      const wasActive = item.id === activeContractId
      deleteSession(item.id)
      if (wasActive) router.push('/workspace/new')
    } else {
      setDeleteTarget(item)
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget || deleteLoading) return
    setDeleteLoading(true)
    try {
      await createApiClient(getToken).deleteContract(deleteTarget.id)
      const wasActive = deleteTarget.id === activeContractId
      deleteSession(deleteTarget.id)
      setContracts(prev => prev.filter(c => c.id !== deleteTarget.id))
      setDeleteTarget(null)
      if (wasActive) router.push('/workspace/new')
    } catch {
      setToast('Failed to delete workspace. Please try again.')
      setDeleteTarget(null)
    } finally {
      setDeleteLoading(false)
    }
  }

  return (
    <div style={{ padding: '0 10px', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <div style={sectionLbl}>
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

      <div
        className="ws-list-scroll"
        onTouchStart={e => { touchStartY.current = e.touches[0].clientY; touchMoved.current = false }}
        onTouchMove={e => { if (Math.abs(e.touches[0].clientY - touchStartY.current) > 5) touchMoved.current = true }}
        style={{
          flex: 1, overflowY: 'auto', minHeight: 0,
          // Fade the first/last ~16px so scrolled items appear/disappear
          // smoothly instead of hard-cutting at the container edges. Padding
          // matches the fade so the first/last items sit past the fade when
          // not scrolled (they're never cut off at rest), but still scroll
          // through the fade naturally when the user scrolls.
          paddingTop: '16px', paddingBottom: '16px',
          maskImage: 'linear-gradient(to bottom, transparent 0, black 16px, black calc(100% - 16px), transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, transparent 0, black 16px, black calc(100% - 16px), transparent 100%)',
        }}
      >
      {!isLoaded || (isSignedIn && !hasFetchedOnce && sessions.length === 0) ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', padding: '4px 0' }}>
          {Array.from({ length: 4 }, (_, i) => <SidebarRowSkeleton key={i} />)}
        </div>
      ) : fetchFailed ? (
        <div style={{ padding: '8px 8px 12px' }}>
          <p style={{ fontSize: '12px', color: 'var(--c-sidebar-section)', fontFamily: 'Plus Jakarta Sans, sans-serif', margin: 0 }}>
            Could not reach the server. Check your connection and try again.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: '8px 8px 12px' }}>
          {!isSignedIn ? (
            <p style={{ fontSize: '12px', color: 'var(--c-sidebar-section)', fontFamily: 'Plus Jakarta Sans, sans-serif', margin: 0 }}>
              Sign in to see your workspaces.
            </p>
          ) : isSignedIn && !accountsLoading && accounts.length === 0 ? (
            <div style={{ background: 'var(--c-amber-bg)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '8px', padding: '10px 12px' }}>
              <p style={{ fontSize: '12px', color: 'var(--c-sub)', fontFamily: 'Plus Jakarta Sans, sans-serif', margin: '0 0 8px', lineHeight: 1.5 }}>
                Connect a Meta Ads account to save your contracts and workspaces.
              </p>
              <a href="/settings" style={{ fontSize: '11px', fontWeight: 700, color: 'var(--c-indigo)', textDecoration: 'none', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                Connect account →
              </a>
            </div>
          ) : allItems.length === 0 ? (
            <p style={{ fontSize: '12px', color: 'var(--c-sidebar-section)', fontFamily: 'Plus Jakarta Sans, sans-serif', margin: 0 }}>
              No workspaces yet. Start a new contract above.
            </p>
          ) : (
            <p style={{ fontSize: '12px', color: 'var(--c-sidebar-section)', fontFamily: 'Plus Jakarta Sans, sans-serif', margin: 0 }}>
              No contracts match
            </p>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {(() => {
            const viewedMap = getViewedMap()
            return filtered.map(item => {
            const isActive   = item.id === activeContractId
            const showBtn    = hoveredId === item.id || menuState?.item?.id === item.id
            const needsAction = requiresAction(item.status)
            // Only real backend contracts can be "unread" (they have activity
            // timestamps); local drafts are never unread since there's no
            // agent activity on them yet.
            const unread     = !isActive && item._raw && isUnread(item._raw, viewedMap)
            return (
              <div
                key={item.id}
                style={{ position: 'relative', borderRadius: '8px', background: isActive ? '#EFF6FF' : showBtn ? '#F5F9FF' : 'transparent', transition: 'background 0.12s' }}
                onMouseEnter={() => setHoveredId(item.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                <Link
                  href={item.href}
                  onClick={e => { if (touchMoved.current) e.preventDefault() }}
                  style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '7px 8px', paddingRight: showBtn ? '28px' : '8px', borderRadius: '8px', textDecoration: 'none', color: 'var(--c-sidebar-text)', transition: 'padding-right 0.1s' }}
                >
                  {/* Leading slot — fixed width so titles align whether or not
                      the action-dot is rendered. Pulse only when the agent is
                      blocked on the merchant. */}
                  <div style={{ width: '6px', flexShrink: 0, marginTop: '5px' }}>
                    {needsAction && (
                      <div
                        title="Action required"
                        style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--c-amber)', animation: 'agentThinkPulse 1.5s ease-in-out infinite' }}
                      />
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: '14px',
                      fontWeight: isActive ? 600 : 500,
                      color: isActive ? 'var(--c-indigo)' : 'var(--c-sidebar-text)',
                      fontFamily: 'Plus Jakarta Sans, sans-serif',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {item.title}
                    </div>
                    <div suppressHydrationWarning style={{ fontSize: '11px', color: 'var(--c-sidebar-section)', fontFamily: 'Plus Jakarta Sans, sans-serif', marginTop: '1px' }}>
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
          })
          })()}
        </div>
      )}
      </div>

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
