'use client'
import { useState, useCallback } from 'react'

// ─── HOOK ─────────────────────────────────────────────────────────────────────
// Manages the approve/decline lifecycle for agent-action cards.
// Decoupled from useMessages intentionally: approval has its own write path
// (POST to backend), while messages are read via SSE stream.
//
// Usage:
//   const { getStatus, approve, decline } = useActionApprovals(contractId, {
//     onApproved: (actionId) => appendMessage({ role: 'agent', text: '...' }),
//   })
//
// Wire-up when backend is ready:
//   approve  → POST /api/contracts/:id/actions/:actionId/approve
//   decline  → POST /api/contracts/:id/actions/:actionId/decline { reason }
//   After approval the agent's next message arrives via the useMessages SSE stream.

export function useActionApprovals(contractId, { onApproved, onDeclined } = {}) {
  // Keyed by actionId. Values: 'pending' | 'approved' | 'declined'
  // Only overrides are stored here; baseline status comes from the message itself.
  const [overrides, setOverrides] = useState({})

  // Reset overrides when switching contracts
  // (approved actions from a previous contract shouldn't bleed through)
  const [lastContractId, setLastContractId] = useState(contractId)
  if (contractId !== lastContractId) {
    setOverrides({})
    setLastContractId(contractId)
  }

  // Resolve effective status: local override wins, then falls back to message's own status
  const getStatus = useCallback((actionId, baseStatus = 'pending') => {
    return overrides[actionId] ?? baseStatus
  }, [overrides])

  const approve = useCallback((actionId) => {
    setOverrides(prev => ({ ...prev, [actionId]: 'approved' }))

    // TODO: POST /api/contracts/:contractId/actions/:actionId/approve
    // On success the agent's next step arrives via useMessages SSE — no need
    // to manually append; just let the stream handle it.

    onApproved?.(actionId)
  }, [contractId, onApproved])

  const decline = useCallback((actionId, reason = '') => {
    setOverrides(prev => ({ ...prev, [actionId]: 'declined' }))

    // TODO: POST /api/contracts/:contractId/actions/:actionId/decline { reason }

    onDeclined?.(actionId, reason)
  }, [contractId, onDeclined])

  return {
    getStatus,
    approve,
    decline,
  }
}
