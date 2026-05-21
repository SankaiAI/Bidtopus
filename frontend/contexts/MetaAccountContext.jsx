'use client'
import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '@clerk/nextjs'
import { createApiClient } from '@/lib/api'

/**
 * Multi-account state for the whole app.
 *
 * Provides the merchant's connected Meta Ads accounts plus the currently
 * "active" one. Pages that list contracts watch `activeAccount.id` and refetch
 * scoped data when it changes.
 *
 * The active selection is persisted to localStorage so a refresh keeps it.
 * On first load (or if the stored account no longer belongs to the user), we
 * fall back to the first account returned by the API.
 *
 * Backend surface (from ticket #76):
 *   GET    /api/users/me/meta-accounts
 *   POST   /api/users/me/meta-accounts        — idempotent connect
 *   DELETE /api/users/me/meta-accounts/{id}    — idempotent disconnect
 *
 * Account shape: { id (UUID), meta_ads_account_id (string like "act_1234567"),
 *                  label (nullable string), created_at }
 */

const STORAGE_KEY = 'bidtopus-active-account-id'

const MetaAccountContext = createContext({
  accounts: [],
  activeAccount: null,
  loading: false,
  error: null,
  setActiveAccount: () => {},
  reloadAccounts: async () => null,
})

export function useMetaAccount() {
  return useContext(MetaAccountContext)
}

export default function MetaAccountProvider({ children }) {
  const { getToken, isLoaded, isSignedIn } = useAuth()
  const [accounts, setAccounts]           = useState([])
  const [activeId, setActiveId]           = useState(null)
  const [loading, setLoading]             = useState(false)
  const [error, setError]                 = useState(null)

  // Restore last selection from storage once on mount (client only).
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) setActiveId(saved)
    } catch {}
  }, [])

  const reloadAccounts = useCallback(async () => {
    if (!isSignedIn) return null
    setLoading(true)
    setError(null)
    try {
      const rows = await createApiClient(getToken).listMetaAccounts()
      const list = Array.isArray(rows) ? rows : []
      setAccounts(list)
      // Repair activeId if the stored one no longer belongs to the user.
      setActiveId(prev => {
        if (prev && list.some(a => a.id === prev)) return prev
        const fallback = list[0]?.id ?? null
        if (fallback && typeof window !== 'undefined') {
          try { localStorage.setItem(STORAGE_KEY, fallback) } catch {}
        }
        return fallback
      })
      return list
    } catch (e) {
      setError(e?.message || 'Failed to load Meta Ads accounts')
      return null
    } finally {
      setLoading(false)
    }
  }, [getToken, isSignedIn])

  useEffect(() => {
    if (!isLoaded) return
    if (!isSignedIn) { setAccounts([]); setActiveId(null); return }
    reloadAccounts()
  }, [isLoaded, isSignedIn, reloadAccounts])

  const setActiveAccount = useCallback((next) => {
    const id = next && typeof next === 'object' ? next.id : next
    setActiveId(id ?? null)
    if (typeof window !== 'undefined') {
      try {
        if (id) localStorage.setItem(STORAGE_KEY, id)
        else localStorage.removeItem(STORAGE_KEY)
      } catch {}
    }
  }, [])

  const activeAccount = useMemo(
    () => accounts.find(a => a.id === activeId) || null,
    [accounts, activeId],
  )

  const value = useMemo(
    () => ({ accounts, activeAccount, loading, error, setActiveAccount, reloadAccounts }),
    [accounts, activeAccount, loading, error, setActiveAccount, reloadAccounts],
  )

  return (
    <MetaAccountContext.Provider value={value}>
      {children}
    </MetaAccountContext.Provider>
  )
}

/** Human label for a Meta account. Prefers `label`, else the external id. */
export function accountLabel(account) {
  if (!account) return ''
  if (account.label) return account.label
  return account.meta_ads_account_id || account.id
}
