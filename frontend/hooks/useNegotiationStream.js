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
  const [activeSeqId,  setActiveSeqId]  = useState(null)
  const [title,        setTitle]        = useState('New Conversation')
  const [contractId,   setContractId]   = useState(null)
  const [chatStep,     setChatStep]     = useState('choose')
  const [isNegotiating, setIsNegotiating] = useState(false)
  const [termsReady,   setTermsReady]   = useState(false)

  const contractIdRef      = useRef(null)
  const isNegotiatingRef   = useRef(false)
  const streamingDetailRef = useRef('')
  const currentSeqIdRef    = useRef(null)
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
    setActiveSeqId(null)
    streamingDetailRef.current = ''
    currentSeqIdRef.current = null
    setTitle('New Conversation')
    setIsNegotiating(false)
    isNegotiatingRef.current = false
    setTermsReady(false)

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
              ? { role: 'assistant', acknowledgment: '', ackDone: true, segments: m.content ? [{ type: 'text', content: m.content }] : [] }
              : { role: 'user', content: m.content }
          })
        if (uiMsgs.length > 0) { setMessages(uiMsgs); setChatStep('ready') }
      }
      if (contractResult.status === 'fulfilled' && contractResult.value) {
        const ct = contractResult.value
        if (ct.title) { setTitle(ct.title); upsertSession(cid, { title: ct.title }) }
        if (ct.status === 'negotiating') { setIsNegotiating(true); isNegotiatingRef.current = true }
        else if (ct.status) onContractCreated?.(ct)
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
    setTermsReady(false)

    const userMsg = { role: 'user', content: text.trim() }
    const updatedHistory = [...messages, userMsg]
    setMessages(updatedHistory)
    setLoading(true)

    const controller = new AbortController()
    abortControllerRef.current = controller

    let segText = ''
    let streamingStarted = false
    let lastFlushTime = 0

    const flushText = () => {
      if (!segText) return
      const snap = segText
      setMessages(prev => {
        const msgs = [...prev]
        const last = msgs[msgs.length - 1]
        if (!last || last.role !== 'assistant') {
          return [...msgs, { role: 'assistant', acknowledgment: '', ackDone: true, segments: [{ type: 'text', content: snap }] }]
        }
        const msg = { ...last }
        const segs = [...(msg.segments || [])]
        if (segs.length > 0 && segs[segs.length - 1].type === 'text') {
          segs[segs.length - 1] = { ...segs[segs.length - 1], content: snap }
        } else {
          segs.push({ type: 'text', content: snap })
        }
        msg.segments = segs
        msgs[msgs.length - 1] = msg
        return msgs
      })
    }

    try {
      // Post-finalization: route to the grounded workspace chat endpoint instead of negotiation
      const workspaceMode = !isNegotiatingRef.current && !!contractIdRef.current
      let res
      if (workspaceMode) {
        const token = await getToken()
        res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/contracts/${contractIdRef.current}/chat/stream`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ message: text.trim() }),
          signal: controller.signal,
        })
      } else {
        res = await fetch('/api/agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: text.trim(),
            history: [],
            ...(contractIdRef.current ? { contract_id: contractIdRef.current } : {}),
          }),
          signal: controller.signal,
        })
      }
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
            setMessages(prev => [...prev, { role: 'assistant', acknowledgment: data.sentence || '', ackDone: true, segments: [] }])
            setLoading(false)

          } else if (eventType === 'thinking_step_start') {
            const seqId = data.thinking_sequence_id || data.step_id
            const isNewSeq = seqId !== currentSeqIdRef.current
            currentSeqIdRef.current = seqId
            streamingDetailRef.current = ''
            setLiveDetail('')
            setActiveStepId(data.step_id)
            setActiveSeqId(seqId)
            const newStep = { id: data.step_id, label: data.label, detail: '', isComplete: false }
            const pendingText = isNewSeq ? segText : ''
            if (isNewSeq) segText = ''
            setMessages(prev => {
              const msgs = [...prev]
              if (msgs.length === 0 || msgs[msgs.length - 1].role !== 'assistant') {
                msgs.push({ role: 'assistant', acknowledgment: '', ackDone: true, segments: [] })
              }
              const last = { ...msgs[msgs.length - 1] }
              const segs = [...(last.segments || [])]
              if (isNewSeq) {
                if (pendingText) {
                  if (segs.length > 0 && segs[segs.length - 1].type === 'text') {
                    segs[segs.length - 1] = { ...segs[segs.length - 1], content: pendingText }
                  } else {
                    segs.push({ type: 'text', content: pendingText })
                  }
                }
                segs.push({ type: 'thinking', seqId, steps: [newStep], isComplete: false, isOpen: true })
              } else {
                const si = segs.length - 1
                if (si >= 0 && segs[si].type === 'thinking') {
                  segs[si] = { ...segs[si], steps: [...segs[si].steps, newStep] }
                }
              }
              last.segments = segs
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
            const seqId = data.thinking_sequence_id || currentSeqIdRef.current
            setMessages(prev => {
              const msgs = [...prev]
              const last = { ...msgs[msgs.length - 1] }
              last.segments = (last.segments || []).map(s =>
                s.type === 'thinking' && s.seqId === seqId
                  ? { ...s, steps: s.steps.map(st => st.id === data.step_id ? { ...st, detail: committed || st.detail, isComplete: true } : st) }
                  : s
              )
              msgs[msgs.length - 1] = last
              return msgs
            })

          } else if (eventType === 'thinking_end') {
            // Flush any pending post-thinking text immediately so segment 3
            // appears below the ThinkingBlock rather than waiting until sendMessage exits
            if (segText) flushText()
            const seqId = data.thinking_sequence_id || currentSeqIdRef.current
            setActiveSeqId(null)
            setMessages(prev => {
              const msgs = [...prev]
              const last = { ...msgs[msgs.length - 1] }
              last.segments = (last.segments || []).map(s =>
                s.type === 'thinking' && s.seqId === seqId ? { ...s, isComplete: true, isOpen: false } : s
              )
              msgs[msgs.length - 1] = last
              return msgs
            })

          } else if (eventType === 'text') {
            if (!streamingStarted) { streamingStarted = true; setLoading(false); setIsStreaming(true) }
            segText += (data.delta || '').replace(/�/g, '')
            const now = Date.now()
            if (now - lastFlushTime >= 50) { lastFlushTime = now; flushText() }

          } else if (eventType === 'terms_ready') {
            setTermsReady(true)

          } else if (eventType === 'session_created') {
            const cid = data.contract_id
            if (sessionId && sessionId !== cid) deleteSession(sessionId)
            setContractId(cid)
            contractIdRef.current = cid
            prevSessionIdRef.current = cid
            setIsNegotiating(true)
            isNegotiatingRef.current = true
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
            setIsNegotiating(false)
            isNegotiatingRef.current = false
            setTermsReady(false)
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

      if (segText) flushText()

    } catch (err) {
      if (err.name !== 'AbortError') {
        setMessages(prev => [...prev, { role: 'assistant', acknowledgment: '', ackDone: true, segments: [{ type: 'text', content: err.message || 'Something went wrong. Please try again.' }] }])
      }
    } finally {
      setIsStreaming(false)
      setLoading(false)
      setLiveDetail('')
      setActiveStepId(null)
      setActiveSeqId(null)
      currentSeqIdRef.current = null
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
    messages, setMessages, loading, isStreaming, liveDetail, activeStepId, activeSeqId,
    title, contractId, chatStep, setChatStep,
    sendMessage, stopStream, saveTitle,
    isSignedIn, isLoaded, isNegotiating, termsReady,
  }
}
