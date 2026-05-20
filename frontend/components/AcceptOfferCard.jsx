'use client'
import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@clerk/nextjs'
import { createApiClient } from '@/lib/api'

/**
 * Accept-offer card for the workspace right sidebar.
 *
 * Renders when the contract status is `Offered`. The merchant clicks Accept,
 * we POST /api/contracts/:id/accept, then the parent refetches the contract
 * so the workspace transitions to the Fund step.
 *
 * Offer ID is sourced from the latest agent message's `extra.offer_id`
 * (set by backend's generate_agent_offer in services/contract_service.py:327).
 * The agent's offer text is already visible in the chat to the left, so this
 * card just provides the action — no need to repeat the message content.
 */
export default function AcceptOfferCard({ contractId, onAccepted }) {
  const { getToken } = useAuth()
  const [offerId, setOfferId] = useState(null)
  const [offerType, setOfferType] = useState(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const api = createApiClient(getToken)
    api.getMessages(contractId)
      .then(rows => {
        if (cancelled) return
        // Collect every offer_id seen in agent message extras — for debugging
        // when /accept rejects with "Offer not found or does not match contract".
        const allOfferIds = []
        for (const m of rows) {
          const extra = m.extra || m.metadata || {}
          if (m.role === 'agent' && extra.offer_id) {
            allOfferIds.push({ id: extra.offer_id, type: extra.offer_type, at: m.created_at })
          }
        }
        if (allOfferIds.length === 0) {
          console.warn('[AcceptOfferCard] No agent message carries extra.offer_id for contract', contractId)
        } else {
          console.log('[AcceptOfferCard] offer_ids in messages (oldest → newest):', allOfferIds)
        }
        const latest = allOfferIds[allOfferIds.length - 1]
        if (latest) {
          setOfferId(latest.id)
          setOfferType(latest.type || null)
        }
        setLoading(false)
      })
      .catch(e => {
        if (cancelled) return
        setError(e?.message || 'Could not load the agent offer')
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [contractId, getToken])

  const accept = useCallback(async () => {
    if (!offerId) return
    setError(null)
    setSubmitting(true)
    try {
      const api = createApiClient(getToken)
      await api.acceptOffer(contractId, offerId)
      setDone(true)
      if (onAccepted) await onAccepted()
    } catch (e) {
      setError(e?.message || 'Accept failed')
    } finally {
      setSubmitting(false)
    }
  }, [contractId, offerId, getToken, onAccepted])

  if (loading) {
    return <p style={{ fontSize: '12px', color: 'var(--c-muted)', fontFamily: 'Plus Jakarta Sans, sans-serif', margin: 0 }}>Loading offer…</p>
  }

  if (offerType === 'reject') {
    return (
      <p style={{ fontSize: '13px', color: 'var(--c-sub)', lineHeight: 1.6, margin: 0, fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
        The agent declined this contract. Open a new workspace to propose different terms.
      </p>
    )
  }

  if (!offerId) {
    return (
      <p style={{ fontSize: '12px', color: 'var(--c-muted)', fontFamily: 'Plus Jakarta Sans, sans-serif', margin: 0, lineHeight: 1.6 }}>
        Waiting for the agent's offer to appear in chat…
      </p>
    )
  }

  return (
    <div>
      <p style={{ fontSize: '13px', color: 'var(--c-sub)', lineHeight: 1.65, margin: '0 0 12px', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
        {offerType === 'counteroffer'
          ? "The agent counter-offered — review the revised terms in chat, then accept to lock them in."
          : 'The agent accepted your contract terms — accept to lock them in and continue to escrow funding.'}
      </p>
      <button
        onClick={accept}
        disabled={submitting || done}
        style={{
          width: '100%', padding: '12px', borderRadius: '9px', border: 'none',
          background: done ? 'var(--c-green)' : 'var(--c-indigo)',
          color: '#fff', fontSize: '13px', fontWeight: 700,
          cursor: submitting || done ? 'default' : 'pointer',
          fontFamily: 'Plus Jakarta Sans, sans-serif',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
          transition: 'opacity 0.15s',
        }}
        onMouseEnter={e => { if (!submitting && !done) e.currentTarget.style.opacity = '0.88' }}
        onMouseLeave={e => { if (!submitting && !done) e.currentTarget.style.opacity = '1' }}
      >
        {done ? 'Accepted — loading next step…' : submitting ? 'Accepting…' : 'Accept offer & continue'}
        {!submitting && !done && (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        )}
      </button>
      {error && (
        <div style={{ marginTop: '10px', padding: '8px 12px', borderRadius: '8px', background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: '12px', fontFamily: 'Plus Jakarta Sans, sans-serif', lineHeight: 1.5 }}>
          <div>{error}</div>
          {offerId && (
            <div style={{ marginTop: '4px', fontSize: '10px', opacity: 0.75, fontFamily: 'monospace' }}>
              offer_id sent: {offerId}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
