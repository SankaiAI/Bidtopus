/**
 * Backend API client factory.
 * Usage:
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

// Returns raw Response so the caller can read the body as a ReadableStream (SSE)
async function requestRaw(getToken, method, path, body) {
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

  return res
}

export function createApiClient(getToken) {
  const get     = (path)       => request(getToken, 'GET',    path)
  const post    = (path, body) => request(getToken, 'POST',   path, body)
  const del     = (path)       => request(getToken, 'DELETE', path)
  const postRaw = (path, body) => requestRaw(getToken, 'POST', path, body)

  return {
    // ── Contracts ──────────────────────────────────────────────────────
    createContract: (body) => post('/api/contracts', body),
    getContract:    (id)   => get(`/api/contracts/${id}`),
    listContracts:  ()     => get('/api/contracts'),
    deleteContract: (id)   => del(`/api/contracts/${id}`),

    // ── Underwriting & Offer ───────────────────────────────────────────
    underwrite:       (id)          => post(`/api/contracts/${id}/underwrite`),
    generateAgentOffer: (id)        => post(`/api/contracts/${id}/agent-offer`),
    // offerId comes from the agent-offer response
    acceptOffer:      (id, offerId) => post(`/api/contracts/${id}/accept`, { offer_id: offerId }),

    // ── Messages / Timeline ────────────────────────────────────────────
    getMessages: (id) => get(`/api/contracts/${id}/messages`),

    // ── Escrow ─────────────────────────────────────────────────────────
    // chainContractId: the Arc on-chain contract address returned by Circle App Kit
    fundEscrow: (id, txHash, chainContractId, amountUsdc) =>
      post(`/api/contracts/${id}/fund-escrow`, {
        tx_hash: txHash,
        chain_contract_id: chainContractId,
        amount_usdc: amountUsdc,
      }),

    // ── Strategy ───────────────────────────────────────────────────────
    // Returns { plan_id, summary, planned_actions } — store in state, do not re-fetch
    generateStrategy: (id) => post(`/api/contracts/${id}/generate-strategy`),
    // planId comes from generateStrategy response; approved=false to decline
    approveExecution: (id, planId, approved = true) =>
      post(`/api/contracts/${id}/approve-execution`, { plan_id: planId, approved }),
    // Fire-and-forget immediately after approveExecution
    executeAdsActions: (id) => post(`/api/contracts/${id}/execute-ads-actions`),
    // Per-action approvals (manual mode)
    approveAction: (id, actionId) => post(`/api/contracts/${id}/actions/${actionId}/approve`),
    declineAction: (id, actionId) => post(`/api/contracts/${id}/actions/${actionId}/decline`),

    // ── Performance ────────────────────────────────────────────────────
    getPerformance: (id) => get(`/api/contracts/${id}/performance`),

    // ── Resolution ─────────────────────────────────────────────────────
    resolveContract: (id) => post(`/api/contracts/${id}/resolve`),

    // ── Chat (SSE streaming) ───────────────────────────────────────────
    // Returns raw Response — caller reads body as ReadableStream
    // Stream format: lines of "data: {\"text\":\"...\"}" ending with "data: [DONE]"
    // See useMessages.js sendMessage for the consumer implementation
    streamChat: (id, message) =>
      postRaw(`/api/contracts/${id}/chat/stream`, { message }),

    // ── Contract title (ticket #40) ────────────────────────────────────
    updateTitle: (id, title) => post(`/api/contracts/${id}/title`, { title }),

    // ── Users ──────────────────────────────────────────────────────────
    getMe: () => get('/api/users/me'),
    connectWallet: (walletAddress, signature) =>
      post('/api/users/me/wallet', { wallet_address: walletAddress, signature }),
  }
}
