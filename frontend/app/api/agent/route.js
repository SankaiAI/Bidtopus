import { auth } from '@clerk/nextjs/server'
import { logInfo, logWarn, logError, logDebug } from '@/lib/logger'

const SRC = 'api/agent'

function sse(event, data) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

// Returns a stop() function — call it to prevent any pending timeouts from
// writing into an already-closed controller (avoids ERR_INVALID_STATE).
function demoStream(encoder, controller) {
  logInfo(SRC, 'demo stream started (no NEXT_PUBLIC_API_URL configured)')

  let stopped = false
  const enq = (chunk) => {
    if (stopped) return
    try { controller.enqueue(chunk) } catch (_) { stopped = true }
  }

  const steps = [
    { id: 's1', label: 'Evaluating ROAS benchmark', detail: 'Checking Meta Ads industry benchmarks... E-commerce average is 2.0–3.5x. A 2.0 target is achievable with proper audience targeting.' },
    { id: 's2', label: 'Estimating success probability', detail: 'ML model inputs: target ROAS 2.0, spend floor $500, 7-day window, standard e-commerce vertical. Historical win rate for similar contracts: 68%.' },
    { id: 's3', label: 'Structuring contract terms', detail: 'Calculating fair success fee... Based on risk profile and expected ROAS uplift, 100 USDC is reasonable for this contract size.' },
  ]

  let delay = 0
  const q = (fn, ms) => { delay += ms; setTimeout(() => { if (!stopped) fn() }, delay) }

  enq(encoder.encode(sse('acknowledgment', { sentence: 'Analyzing your contract terms now…' })))

  steps.forEach((step, i) => {
    q(() => {
      logDebug(SRC, 'demo thinking_step_start', { step_id: step.id })
      enq(encoder.encode(sse('thinking_step_start', { step_id: step.id, label: step.label })))
    }, i === 0 ? 80 : 250)

    const words = step.detail.split(' ')
    words.forEach((word, wi) => {
      q(() => enq(encoder.encode(sse('thinking_step_detail', { delta: (wi === 0 ? '' : ' ') + word }))), 12)
    })

    q(() => {
      logDebug(SRC, 'demo thinking_step_end', { step_id: step.id })
      enq(encoder.encode(sse('thinking_step_end', { step_id: step.id })))
    }, 60)
  })

  q(() => {
    logDebug(SRC, 'demo thinking_end')
    enq(encoder.encode(sse('thinking_end', {})))
  }, 80)

  const response = `**Underwriting Decision: Accept** ✓

**Success Probability: 68%**

| Parameter | Your Target | My Assessment |
|-----------|-------------|---------------|
| ROAS target | ≥ 2.0× | Achievable — industry avg is 2.0–3.5× |
| Min spend | $500 | Sufficient for meaningful data |
| Window | 7 days | Standard — enough runway |
| Success fee | 100 USDC | Fair for this risk profile |

**What I'll do if you accept:**
- Lock 100 USDC in escrow on Arc testnet
- Launch a Meta Ads retargeting campaign optimized for ROAS
- Monitor daily performance against your 2.0× target
- Release fee to my wallet on success, or refund to you on failure

The main risk is cold-audience reach within 7 days. I'll front-load spend in the first 3 days to gather signal fast, then optimize.

Ready to proceed? I'll generate a full strategy plan once you fund the escrow.`

  const chars = response.split('')
  chars.forEach((char, ci) => {
    q(() => {
      enq(encoder.encode(sse('text', { delta: char })))
      if (ci === chars.length - 1) {
        setTimeout(() => {
          if (stopped) return
          logInfo(SRC, 'demo stream complete', { chars: chars.length })
          try { controller.close() } catch (_) {}
        }, 50)
      }
    }, ci * 1.5)
  })

  return () => { stopped = true }
}

export async function POST(request) {
  const reqStart = Date.now()
  const { message, history = [] } = await request.json()

  if (!message?.trim()) {
    logWarn(SRC, 'empty message rejected')
    return new Response(JSON.stringify({ error: 'message required' }), { status: 400 })
  }

  const backendUrl = process.env.NEXT_PUBLIC_API_URL
  logInfo(SRC, 'POST received', { message: message.slice(0, 120), hasBackend: !!backendUrl })

  // ── Demo fallback (no backend configured) ────────────────────────────────
  if (!backendUrl) {
    const encoder = new TextEncoder()
    let stopDemo = null
    const stream = new ReadableStream({
      start(controller) { stopDemo = demoStream(encoder, controller) },
      cancel() {
        logInfo(SRC, 'client disconnected — stopping demo stream')
        if (stopDemo) stopDemo()
      },
    })
    return new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
    })
  }

  // ── Proxy to backend negotiation stream ──────────────────────────────────
  const { getToken } = await auth()
  const token = await getToken()

  const upstream = new AbortController()

  try {
    logInfo(SRC, 'proxying to backend', { endpoint: '/api/negotiation/stream', historyLen: history.length })

    const res = await fetch(`${backendUrl}/api/negotiation/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ message, history }),
      signal: upstream.signal,
    })

    if (!res.ok) {
      logError(SRC, 'backend error', { status: res.status, elapsed_ms: Date.now() - reqStart })
      const encoder = new TextEncoder()
      return new Response(
        encoder.encode(sse('error', { message: `Backend returned ${res.status}` })),
        { headers: { 'Content-Type': 'text/event-stream' } }
      )
    }

    logInfo(SRC, 'backend stream open', { elapsed_ms: Date.now() - reqStart })

    // Pipe the backend SSE stream directly to the client — schemas match.
    return new Response(res.body, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
    })

  } catch (err) {
    if (err.name === 'AbortError') return new Response(null, { status: 499 })
    logError(SRC, 'proxy error', { error: err.message, elapsed_ms: Date.now() - reqStart })
    const encoder = new TextEncoder()
    return new Response(
      encoder.encode(sse('error', { message: err.message || 'Agent unavailable' })),
      { headers: { 'Content-Type': 'text/event-stream' } }
    )
  }
}
