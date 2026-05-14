import Anthropic from '@anthropic-ai/sdk'
import { logInfo, logWarn, logError, logDebug } from '@/lib/logger'

const SRC = 'api/agent'

const SYSTEM_PROMPT = `You are the OutcomeX AI agent — an expert in performance marketing and Meta Ads campaigns.
Your role is to underwrite performance contracts: evaluate whether a merchant's ROAS target is achievable,
estimate success probability, negotiate fair terms, and explain your reasoning clearly.

When evaluating a contract proposal:
1. Assess the ROAS target against typical Meta Ads benchmarks (2.0–4.0x is typical; >5x is ambitious)
2. Consider the time window, minimum spend, and campaign context
3. Provide a success probability estimate (0–100%)
4. Suggest contract terms you would accept (or counter-propose)
5. Explain your underwriting reasoning in plain language

Be direct, quantitative, and honest. If a target is unrealistic, say so and explain why.
Format responses with markdown: use **bold** for key numbers, tables for comparisons, and bullet lists for steps.`

function sse(event, data) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

// Returns a stop() function — call it to prevent any pending timeouts from
// writing into an already-closed controller (avoids ERR_INVALID_STATE).
function demoStream(encoder, controller) {
  logInfo(SRC, 'demo stream started (no ANTHROPIC_API_KEY)')

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
  const { message } = await request.json()

  if (!message?.trim()) {
    logWarn(SRC, 'empty message rejected')
    return new Response(JSON.stringify({ error: 'message required' }), { status: 400 })
  }

  logInfo(SRC, 'POST received', { message: message.slice(0, 120), hasKey: !!process.env.ANTHROPIC_API_KEY })

  const encoder = new TextEncoder()

  let stopDemo = null
  let claudeCancelled = false

  const stream = new ReadableStream({
    async start(controller) {
      if (!process.env.ANTHROPIC_API_KEY) {
        stopDemo = demoStream(encoder, controller)
        return
      }

      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

      try {
        logInfo(SRC, 'calling Claude with extended thinking')
        controller.enqueue(encoder.encode(sse('acknowledgment', { sentence: 'Analyzing your contract terms now…' })))

        const claudeStream = await client.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 3072,
          thinking: { type: 'enabled', budget_tokens: 1024 },
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: message }],
          stream: true,
        })

        let thinkingBlockIndex = null
        let stepCounter = 0
        let currentStepId = null
        let textChars = 0

        for await (const event of claudeStream) {
          if (claudeCancelled) break
          logDebug(SRC, 'anthropic event', { type: event.type })

          if (event.type === 'content_block_start') {
            if (event.content_block.type === 'thinking') {
              thinkingBlockIndex = event.index
              stepCounter++
              currentStepId = `s${stepCounter}`
              logInfo(SRC, 'thinking block started', { step_id: currentStepId, index: event.index })
              controller.enqueue(encoder.encode(sse('thinking_step_start', {
                step_id: currentStepId,
                label: `Underwriting step ${stepCounter}`,
              })))
            }

          } else if (event.type === 'content_block_delta') {
            if (event.delta.type === 'thinking_delta' && currentStepId) {
              controller.enqueue(encoder.encode(sse('thinking_step_detail', {
                delta: event.delta.thinking,
              })))
            } else if (event.delta.type === 'text_delta') {
              textChars += event.delta.text.length
              controller.enqueue(encoder.encode(sse('text', {
                delta: event.delta.text,
              })))
            }

          } else if (event.type === 'content_block_stop') {
            if (event.index === thinkingBlockIndex && currentStepId) {
              logInfo(SRC, 'thinking block ended', { step_id: currentStepId })
              controller.enqueue(encoder.encode(sse('thinking_step_end', { step_id: currentStepId })))
              currentStepId = null
              thinkingBlockIndex = null
            }

          } else if (event.type === 'message_stop') {
            if (stepCounter > 0) {
              controller.enqueue(encoder.encode(sse('thinking_end', {})))
            }
            logInfo(SRC, 'stream complete', {
              thinking_steps: stepCounter,
              text_chars: textChars,
              elapsed_ms: Date.now() - reqStart,
            })
          }
        }

        if (!claudeCancelled) controller.close()
      } catch (err) {
        if (claudeCancelled) return
        logError(SRC, 'stream error', { error: err.message, elapsed_ms: Date.now() - reqStart })
        try {
          controller.enqueue(encoder.encode(sse('error', { message: err.message || 'Agent error' })))
          controller.close()
        } catch (_) {}
      }
    },
    cancel() {
      logInfo(SRC, 'client disconnected — cancelling stream')
      if (stopDemo) stopDemo()
      claudeCancelled = true
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
