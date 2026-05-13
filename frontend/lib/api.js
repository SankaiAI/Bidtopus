/**
 * Backend API client factory.
 * Usage:
 *   const { useAuth } = require('@clerk/nextjs')
 *   const { getToken } = useAuth()
 *   const api = createApiClient(getToken)
 *   const contract = await api.getContract(id)
 */

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || ''

async function request(getToken, method, path, body) {
  const token = getToken ? await getToken() : null
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`API ${method} ${path} → ${res.status}: ${text}`)
  }

  const ct = res.headers.get('content-type') || ''
  return ct.includes('application/json') ? res.json() : res.text()
}

export function createApiClient(getToken) {
  const get  = (path)       => request(getToken, 'GET',    path)
  const post = (path, body) => request(getToken, 'POST',   path, body)
  const put  = (path, body) => request(getToken, 'PUT',    path, body)
  const del  = (path)       => request(getToken, 'DELETE', path)

  return {
    // ── Contracts ──────────────────────────────────────────────────────
    // POST /contracts  { target_roas, min_spend_usd, window_days, success_fee_usdc, campaign_mode }
    // → { id, status, ... }
    createContract: (body) => post('/contracts', body),

    // GET /contracts/:id  → PerformanceContract
    getContract: (id) => get(`/contracts/${id}`),

    // GET /contracts  → PerformanceContract[]
    listContracts: () => get('/contracts'),

    // ── Underwriting ───────────────────────────────────────────────────
    // POST /contracts/:id/underwrite  → UnderwritingResult
    underwrite: (id) => post(`/contracts/${id}/underwrite`),

    // POST /contracts/:id/accept  → { status: 'pending_escrow' }
    acceptOffer: (id) => post(`/contracts/${id}/accept`),

    // POST /contracts/:id/counter  { counter_fee_usdc }  → AgentOffer
    counterOffer: (id, body) => post(`/contracts/${id}/counter`, body),

    // ── Messages / Timeline ────────────────────────────────────────────
    // GET /contracts/:id/messages  → ContractMessage[]
    getMessages: (id) => get(`/contracts/${id}/messages`),

    // ── Escrow ─────────────────────────────────────────────────────────
    // POST /contracts/:id/escrow/confirm  { tx_hash }  → { status: 'active' }
    confirmEscrow: (id, txHash) => post(`/contracts/${id}/escrow/confirm`, { tx_hash: txHash }),

    // ── Strategy ───────────────────────────────────────────────────────
    // GET /contracts/:id/strategy  → StrategyPlan
    getStrategy: (id) => get(`/contracts/${id}/strategy`),

    // POST /contracts/:id/strategy/approve  → { status: 'active' }
    approveStrategy: (id) => post(`/contracts/${id}/strategy/approve`),

    // ── Performance ────────────────────────────────────────────────────
    // GET /contracts/:id/performance  → PerformanceSnapshot
    getPerformance: (id) => get(`/contracts/${id}/performance`),

    // ── Actions ────────────────────────────────────────────────────────
    // POST /contracts/:id/actions/:actionId/approve  → { ok: true }
    approveAction: (id, actionId) => post(`/contracts/${id}/actions/${actionId}/approve`),

    // POST /contracts/:id/actions/:actionId/decline  → { ok: true }
    declineAction: (id, actionId) => post(`/contracts/${id}/actions/${actionId}/decline`),

    // ── Resolution ─────────────────────────────────────────────────────
    // GET /contracts/:id/resolution  → ResolutionResult
    getResolution: (id) => get(`/contracts/${id}/resolution`),

    // ── Chat (non-streaming) ───────────────────────────────────────────
    // POST /contracts/:id/chat  { message }  → { reply: string }
    sendChatMessage: (id, message) => post(`/contracts/${id}/chat`, { message }),
  }
}
