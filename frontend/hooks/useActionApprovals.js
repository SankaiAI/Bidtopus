'use client'
import { useState, useCallback } from 'react'
import { useAuth } from '@clerk/nextjs'
import { createApiClient } from '@/lib/api'

export function useActionApprovals(contractId, { onApproved, onDeclined } = {}) {
  const { getToken } = useAuth()
  // Keyed by actionId. Values: 'pending' | 'approved' | 'declined'
  const [overrides, setOverrides] = useState({})
  const [errors,    setErrors]    = useState({})

  // Reset when switching contracts
  const [lastContractId, setLastContractId] = useState(contractId)
  if (contractId !== lastContractId) {
    setOverrides({})
    setErrors({})
    setLastContractId(contractId)
  }

  const getStatus = useCallback((actionId, baseStatus = 'pending') => {
    return overrides[actionId] ?? baseStatus
  }, [overrides])

  const getError = useCallback((actionId) => {
    return errors[actionId] ?? null
  }, [errors])

  const approve = useCallback(async (actionId, planId) => {
    setOverrides(prev => ({ ...prev, [actionId]: 'approved' }))
    setErrors(prev => ({ ...prev, [actionId]: null }))
    const api = createApiClient(getToken)
    try {
      if (planId) {
        await api.approveExecution(contractId, planId, true)
        // fire-and-forget — agent response arrives via SSE /events stream
        api.executeAdsActions(contractId).catch(() => {})
      } else {
        await api.approveAction(contractId, actionId)
      }
      onApproved?.(actionId)
    } catch {
      setOverrides(prev => ({ ...prev, [actionId]: 'pending' }))
      setErrors(prev => ({ ...prev, [actionId]: 'Failed to approve. Please try again.' }))
    }
  }, [contractId, getToken, onApproved])

  const decline = useCallback(async (actionId, planId, reason = '') => {
    setOverrides(prev => ({ ...prev, [actionId]: 'declined' }))
    setErrors(prev => ({ ...prev, [actionId]: null }))
    const api = createApiClient(getToken)
    try {
      if (planId) {
        await api.approveExecution(contractId, planId, false)
      } else {
        await api.declineAction(contractId, actionId)
      }
      onDeclined?.(actionId, reason)
    } catch {
      setOverrides(prev => ({ ...prev, [actionId]: 'pending' }))
      setErrors(prev => ({ ...prev, [actionId]: 'Failed to decline. Please try again.' }))
    }
  }, [contractId, getToken, onDeclined])

  return { getStatus, getError, approve, decline }
}
