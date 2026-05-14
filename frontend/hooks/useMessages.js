'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '@clerk/nextjs'

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || ''

function formatTime(isoString) {
  if (!isoString) return 'Just now'
  try {
    const d = new Date(isoString)
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  } catch (_) {
    return isoString
  }
}

// Maps a backend ContractMessage row to the UI message shape consumed by workspace/page.jsx
// Backend: { id, role, type, content, extra, status, created_at }
// UI:      { id, role, text, time, status, metric?, title?, detail?, actionType?, approvedAt?, plan_id? }
function mapMessage(msg) {
  const extra = msg.extra || {}
  let role = msg.role === 'merchant' ? 'user' : msg.role
  if (msg.type === 'daily_update')     role = 'agent-update'
  if (msg.type === 'approval_request') role = 'agent-action'
  if (msg.type === 'system_event')     role = 'system'

  return {
    id: msg.id,
    role,
    text: msg.content || '',
    time: formatTime(msg.created_at),
    status: msg.status ?? null,
    metric:     extra.metric      ?? undefined,
    title:      extra.title       ?? undefined,
    detail:     extra.detail      ?? undefined,
    actionType: extra.action_type ?? extra.actionType ?? undefined,
    approvedAt: extra.approved_at ? formatTime(extra.approved_at) : undefined,
    plan_id:    extra.plan_id     ?? undefined,
  }
}

export function useMessages(contractId) {
  const { getToken } = useAuth()
  const [messages,    setMessages]    = useState([])
  const [isThinking,  setIsThinking]  = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const abortRef = useRef(null)

  const stopGeneration = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  // Step 1: hydrate full history from DB
  // Step 2: open SSE /events stream for live updates
  useEffect(() => {
    if (!contractId) return
    let cancelled = false

    async function run() {
      // ── Hydration ──────────────────────────────────────────────────
      try {
        const token = await getToken()
        const res = await fetch(`${BASE_URL}/api/contracts/${contractId}/messages`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
        if (res.ok && !cancelled) {
          const data = await res.json()
          if (!cancelled) setMessages(data.map(mapMessage))
        }
      } catch (err) {
        console.warn('[OutcomeX] failed to load message history', err)
      }

      if (cancelled) return

      // ── Live SSE stream ────────────────────────────────────────────
      // Native EventSource doesn't support custom headers, so we use
      // fetch + ReadableStream to attach the Bearer token.
      try {
        const token = await getToken()
        const evtRes = await fetch(`${BASE_URL}/api/contracts/${contractId}/events`, {
          headers: {
            Accept: 'text/event-stream',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        })
        if (!evtRes.ok || cancelled) return
        if (!cancelled) setIsConnected(true)

        const reader  = evtRes.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (!cancelled) {
          const { done, value } = await reader.read()
          if (done || cancelled) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const raw = line.slice(6).trim()
              if (raw === '[DONE]') continue
              try {
                const msg = JSON.parse(raw)
                if (!cancelled) setMessages(prev => [...prev, mapMessage(msg)])
              } catch (_) {}
            }
          }
        }
      } catch (err) {
        if (!cancelled) {
          console.warn('[OutcomeX] SSE /events disconnected', err)
          setIsConnected(false)
        }
      }
    }

    run()
    return () => { cancelled = true; setIsConnected(false) }
  }, [contractId])

  const appendMessage = useCallback((msg) => {
    setMessages(prev => [...prev, msg])
  }, [])

  // Sends a chat message and streams the agent response token-by-token.
  // Note: assumes /chat/stream handles persistence internally (see ticket #8 for confirmation).
  const sendMessage = useCallback(async (text) => {
    appendMessage({ role: 'user', text, time: 'Just now' })
    setIsThinking(true)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const token = await getToken()
      const res = await fetch(`${BASE_URL}/api/contracts/${contractId}/chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message: text }),
        signal: controller.signal,
      })

      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      // Append an empty agent bubble that fills in as chunks arrive
      setMessages(prev => [...prev, { role: 'agent', text: '', time: 'Just now' }])
      setIsThinking(false)
      setIsStreaming(true)

      let agentText = ''
      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let lastFlushTime = 0

      const flushAgentText = () => {
        setMessages(prev => {
          const next = [...prev]
          next[next.length - 1] = { ...next[next.length - 1], text: agentText }
          return next
        })
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const raw = line.slice(6).trim()
            if (raw === '[DONE]') continue
            try {
              const { text: chunk } = JSON.parse(raw)
              if (chunk) {
                agentText += chunk
                // Throttle to 150ms so markdown-heavy messages don't re-parse on every token
                const now = Date.now()
                if (now - lastFlushTime >= 150) { lastFlushTime = now; flushAgentText() }
              }
            } catch (_) {}
          }
        }
      }
      // Final flush — ensure last tokens are visible after the throttle window
      if (agentText) flushAgentText()
    } catch (err) {
      if (err.name === 'AbortError') {
        // User stopped — leave partial content, clean up state silently
        setIsThinking(false)
        setIsStreaming(false)
        return
      }
      console.error('[OutcomeX] chat stream error', err)
      setIsThinking(false)
      appendMessage({
        role: 'agent',
        text: "Sorry, I couldn't process that. Please try again.",
        time: 'Just now',
      })
    } finally {
      setIsStreaming(false)
      setIsThinking(false)
    }
  }, [contractId, getToken, appendMessage])

  return {
    messages,
    isThinking,
    isStreaming,
    isConnected,
    sendMessage,
    stopGeneration,
    appendMessage,
  }
}
