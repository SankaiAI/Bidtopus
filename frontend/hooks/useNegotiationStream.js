'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '@clerk/nextjs'
import { getSession, upsertSession, deleteSession } from '@/lib/workspaceSessions'
import { createApiClient } from '@/lib/api'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isUUID = s => UUID_RE.test(s ?? '')

// Extracts the streaming + session lifecycle logic that was in contracts/new/page.jsx.
// sessionId can be null (brand new), a ws_xxx local ID, or a UUID (server-assigned).
export function useNegotiationStream(sessionId, { onContractCreated, onTitleGenerated } = {}) {
  const { isSignedIn, isLoaded, getToken } = useAuth()

  const [messages,     setMessages]     = useState([])
  const [loading,      setLoading]      = useState(false)
  const [isStreaming,  setIsStreaming]  = useState(false)
  const [liveDetail,   setLiveDetail]   = useState('')
  const [activeStepId, setActiveStepId] = useState(null)
  const [title,        setTitle]        = useState('New Conversation')
  const [contractId,   setContractId]   = useState(null)
  const [chatStep,     setChatStep]     = useState('choose')

  const contractIdRef      = useRef(null)
  const streamingDetailRef = useRef('')
  const abortControllerRef = useRef(null)
  const shouldHydrateRef   = useRef(false)
  const prevSessionIdRef   = useRef(undefined)

  // Reset + fast-paint cache when sessionId changes (sidebar navigation)
  useEffect(() => {
    if (sessionId === prevSessionIdRef.current) return
    prevSessionIdRef.current = sessionId

    abortControllerRef.current?.abort()
    setIsStreaming(false)
    setLoading(false)
    setLiveDetail('')
    setActiveStepId(null)
    streamingDetailRef.current = ''
    setTitle('New Conversation')

    if (sessionId && isUUID(sessionId)) {
      setContractId(sessionId)
      contractIdRef.current = sessionId
      shouldHydrateRef.current = true
      const cached = getSession(sessionId)
      if (cached?.title) setTitle(cached.title)
      if (cached?.messages?.length > 0) { setMessages(cached.messages); setChatStep('ready') }
      else { setMessages([]); setChatStep('choose') }
    } else {
      setContractId(null)
      contractIdRef.current = null
      shouldHydrateRef.current = false
      const existing = sessionId ? getSession(sessionId) : null
      if (existing?.messages?.length > 0) { setMessages(existing.messages); setChatStep('ready') }
      else { setMessages([]); setChatStep('choose') }
    }
  }, [sessionId])

  // Server hydration for UUID sessions (bookmarked URLs, page refreshes)
  useEffect(() => {
    if (!contractId || !isLoaded || !isSignedIn || !shouldHydrateRef.current) return
    shouldHydrateRef.current = false

    const cid = contractId
    const api = createApiClient(getToken)

    Promise.allSettled([api.getMessages(cid), api.getContract(cid)]).then(([msgsResult, contractResult]) => {
      if (msgsResult.status === 'fulfilled') {
        const uiMsgs = msgsResult.value
          .filter(m => m.role !== 'system' && m.type !== 'thinking_step')
          .map(m => {
            const isAgent = m.role === 'agent' || m.role === 'assistant'
            return isAgent
              ? { role: 'assistant', content: m.content, acknowledgment: '', ackDone: true, thinking: null }
              : { role: 'user', content: m.content }
          })
        if (uiMsgs.length > 0) { setMessages(uiMsgs); setChatStep('ready') }
      }
      if (contractResult.status === 'fulfilled' && contractResult.value) {
        const ct = contractResult.value
        if (ct.title) { setTitle(ct.title); upsertSession(cid, { title: ct.title }) }
        if (ct.status && ct.status !== 'negotiating') onContractCreated?.(ct)
      }
    })
  }, [contractId, isLoaded, isSignedIn])

  // Write-through cache: persist messages to localStorage after each completed turn
  useEffect(() => {
    const cacheKey = contractId || sessionId
    if (!cacheKey || messages.length === 0 || isStreaming) return
    upsertSession(cacheKey, { messages })
  }, [messages, isStreaming, sessionId, contractId])

  // Clean up stale local session once server assigns a real contract ID
  useEffect(() => {
    if (!contractId || !sessionId || contractId === sessionId) return
    deleteSession(sessionId)
  }, [contractId, sessionId])

  const sendMessage = useCallback(async (text) => {
    if (!text?.trim() || loading) return
    if (chatStep === 'choose') setChatStep('ready')

    const userMsg = { role: 'user', content: text.trim() }
    const updatedHistory = [...messages, userMsg]
    setMessages(updatedHistory)
    setLoading(true)

    const controller = new AbortController()
    abortControllerRef.current = controller

    let fullText = ''
    let streamingStarted = false
    let lastFlushTime = 0

    const flushText = () => setMessages(prev => {
      const msgs = [...prev]
      const last = msgs[msgs.length - 1]
      if (last?.role === 'assistant') msgs[msgs.length - 1] = { ...last, content: fullText }
      else msgs.push({ role: 'assistant', acknowledgment: '', ackDone: true, content: fullText, thinking: null })
      return msgs
    })

    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text.trim(),
          history: [],
          ...(contractIdRef.current ? { contract_id: contractIdRef.current } : {}),
        }),
        signal: controller.signal,
      })
      if (!res.ok) throw new Error('Agent unavailable')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const blocks = buffer.split('\n\n')
        buffer = blocks.pop() ?? ''

        for (const block of blocks) {
          let eventType = 'message', eventData = ''
          for (const line of block.split('\n')) {
            if (line.startsWith('event: ')) eventType = line.slice(7).trim()
            else if (line.startsWith('data: ')) eventData = line.slice(6).trim()
          }
          if (!eventData) continue
          let data
          try { data = JSON.parse(eventData) } catch { continue }

          if (eventType === 'acknowledgment') {
            setMessages(prev => [...prev, { role: 'assistant', acknowledgment: data.sentence || '', ackDone: true, content: '', thinking: { isOpen: true, isComplete: false, steps: [] } }])
            setLoading(false)

          } else if (eventType === 'thinking_step_start') {
            streamingDetailRef.current = ''
            setLiveDetail('')
            setActiveStepId(data.step_id)
            setMessages(prev => {
              const msgs = [...prev]
              const last = { ...msgs[msgs.length - 1] }
              const t = last.thinking || { steps: [], isComplete: false, isOpen: true }
              last.thinking = { ...t, steps: [...t.steps, { id: data.step_id, label: data.label, detail: '', isComplete: false }] }
              msgs[msgs.length - 1] = last
              return msgs
            })

          } else if (eventType === 'thinking_step_detail') {
            streamingDetailRef.current += data.delta || ''
            setLiveDetail(streamingDetailRef.current)

          } else if (eventType === 'thinking_step_end') {
            const committed = streamingDetailRef.current
            streamingDetailRef.current = ''
            setLiveDetail('')
            setActiveStepId(null)
            setMessages(prev => {
              const msgs = [...prev]
              const last = { ...msgs[msgs.length - 1] }
              const t = last.thinking || { steps: [], isComplete: false, isOpen: true }
              last.thinking = { ...t, steps: t.steps.map(s => s.id === data.step_id ? { ...s, detail: committed, isComplete: true } : s) }
              msgs[msgs.length - 1] = last
              return msgs
            })

          } else if (eventType === 'thinking_end') {
            setMessages(prev => {
              const msgs = [...prev]
              const last = { ...msgs[msgs.length - 1] }
              const t = last.thinking || { steps: [], isComplete: false, isOpen: true }
              last.thinking = { ...t, isComplete: true, isOpen: false }
              msgs[msgs.length - 1] = last
              return msgs
            })

          } else if (eventType === 'text') {
            if (!streamingStarted) { streamingStarted = true; setLoading(false); setIsStreaming(true) }
            fullText += data.delta || ''
            const now = Date.now()
            if (now - lastFlushTime >= 50) { lastFlushTime = now; flushText() }

          } else if (eventType === 'session_created') {
            const cid = data.contract_id
            if (sessionId && sessionId !== cid) deleteSession(sessionId)
            setContractId(cid)
            contractIdRef.current = cid
            prevSessionIdRef.current = cid
            // Silent URL update — no re-mount, component state is preserved
            window.history.replaceState(null, '', `/workspace/${cid}`)
            upsertSession(cid, { title: '', messages: updatedHistory, createdAt: new Date().toISOString() })

          } else if (eventType === 'title_generated') {
            if (data.title) {
              setTitle(data.title)
              if (contractIdRef.current) upsertSession(contractIdRef.current, { title: data.title })
              onTitleGenerated?.(data.title)
            }

          } else if (eventType === 'contract_created') {
            const cid = data.contract_id
            if (cid) {
              createApiClient(getToken).getContract(cid)
                .then(c => onContractCreated?.(c))
                .catch(() => {})
            }

          } else if (eventType === 'error') {
            throw new Error(data.message || 'Agent error')
          }
        }
      }

      if (fullText) flushText()

    } catch (err) {
      if (err.name !== 'AbortError') {
        setMessages(prev => [...prev, { role: 'assistant', acknowledgment: '', ackDone: true, thinking: null, content: err.message || 'Something went wrong. Please try again.' }])
      }
    } finally {
      setIsStreaming(false)
      setLoading(false)
      setLiveDetail('')
      setActiveStepId(null)
      streamingDetailRef.current = ''
    }
  }, [sessionId, messages, loading, chatStep, getToken])

  const stopStream = useCallback(() => { abortControllerRef.current?.abort() }, [])

  const saveTitle = useCallback((newTitle) => {
    setTitle(newTitle)
    const cid = contractIdRef.current
    if (cid) {
      upsertSession(cid, { title: newTitle })
      createApiClient(getToken).updateTitle(cid, newTitle).catch(() => {})
    }
  }, [getToken])

  return {
    messages, loading, isStreaming, liveDetail, activeStepId,
    title, contractId, chatStep, setChatStep,
    sendMessage, stopStream, saveTitle,
    isSignedIn, isLoaded,
  }
}
