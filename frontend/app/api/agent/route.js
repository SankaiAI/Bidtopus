import { auth } from '@clerk/nextjs/server'
import { logInfo, logWarn, logError } from '@/lib/logger'

const SRC = 'api/agent'

function sse(event, data) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

export async function POST(request) {
  const reqStart = Date.now()
  const { message, history = [], contract_id, meta_ads_account_id } = await request.json()

  if (!message?.trim()) {
    logWarn(SRC, 'empty message rejected')
    return new Response(JSON.stringify({ error: 'message required' }), { status: 400 })
  }

  const backendUrl = process.env.NEXT_PUBLIC_API_URL
  if (!backendUrl) {
    logError(SRC, 'NEXT_PUBLIC_API_URL is not set')
    const encoder = new TextEncoder()
    return new Response(
      encoder.encode(sse('error', { message: 'Agent service is not configured. Please contact support.' })),
      { headers: { 'Content-Type': 'text/event-stream' } }
    )
  }

  const { getToken } = await auth()
  const token = await getToken()

  logInfo(SRC, 'POST received', { message: message.slice(0, 120), historyLen: history.length, contract_id: contract_id ?? null })

  try {
    const res = await fetch(`${backendUrl}/api/negotiation/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ message, history, ...(contract_id ? { contract_id } : {}), ...(meta_ads_account_id ? { meta_ads_account_id } : {}) }),
    })

    if (!res.ok) {
      logError(SRC, 'backend error', { status: res.status, elapsed_ms: Date.now() - reqStart })
      const encoder = new TextEncoder()
      return new Response(
        encoder.encode(sse('error', { message: `Agent service returned an error (${res.status}). Please try again.` })),
        { headers: { 'Content-Type': 'text/event-stream' } }
      )
    }

    logInfo(SRC, 'backend stream open', { elapsed_ms: Date.now() - reqStart })

    return new Response(res.body, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
    })

  } catch (err) {
    logError(SRC, 'proxy error', { error: err.message, elapsed_ms: Date.now() - reqStart })
    const encoder = new TextEncoder()
    return new Response(
      encoder.encode(sse('error', { message: 'Agent service is unreachable. Please try again later.' })),
      { headers: { 'Content-Type': 'text/event-stream' } }
    )
  }
}
