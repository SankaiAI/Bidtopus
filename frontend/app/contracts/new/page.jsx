'use client'
import React from 'react'
import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useAuth, useClerk } from '@clerk/nextjs'
import { useOpenMobileSidebar } from '@/components/AppShell'
import AgentInputBar from '@/components/AgentInputBar'

const C = {
  bg:         '#f4f4f8',
  surface:    '#ffffff',
  surfaceAlt: '#f0f0f5',
  border:     '#e4e3ed',
  text:       '#0e0d1a',
  muted:      '#6b6880',
  sub:        '#3d3c54',
  indigo:     '#4F46E5',
  indigoMid:  '#6366F1',
  green:      '#10B981',
  amber:      '#F59E0B',
  red:        '#EF4444',
  userBg:     '#0e0d1a',
}

// ─── AGENT AVATAR ─────────────────────────────────────────────────────────────
function AgentAvatar({ size = 28 }) {
  const iconSize = Math.round(size * 1.0)
  return (
    <div style={{ width: `${size}px`, height: `${size}px`, borderRadius: '50%', background: `${C.indigo}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <svg width={Math.round(iconSize * 0.6)} height={Math.round(iconSize * 0.6)} viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" fill={C.indigo} />
        <circle cx="12" cy="12" r="5" stroke="white" strokeWidth="1.5" fill="none" />
        <circle cx="12" cy="12" r="1.5" fill="white" />
      </svg>
    </div>
  )
}

// ─── QUICK ACTIONS ────────────────────────────────────────────────────────────
const QUICK_ACTIONS = [
  {
    label: 'ROAS ≥ 2.0 contract',
    description: '7 days · 100 USDC fee',
    message: 'Create a contract: ROAS ≥ 2.0, $500 min spend, 7-day window, 100 USDC fee',
    icon: (color) => (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill={color} stroke="none"/>
      </svg>
    ),
  },
  {
    label: 'Evaluate my campaign',
    description: 'Get success probability',
    message: 'Evaluate my Meta Ads campaign — what ROAS can I realistically expect?',
    icon: (color) => (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="2.8"/>
      </svg>
    ),
  },
  {
    label: 'Best terms for budget',
    description: 'Optimize contract parameters',
    message: 'What contract terms give me the best chance of success with a $500 ad spend?',
    icon: (color) => (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>
      </svg>
    ),
  },
  {
    label: 'Review ad strategy',
    description: 'Evaluate proposed campaign plan',
    message: 'Review the proposed Meta Ads retargeting strategy and tell me if it will hit my ROAS target',
    icon: (color) => (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
      </svg>
    ),
  },
]

const STARTERS = [
  "Create a ROAS ≥ 2.0 contract for 7 days",
  "What success probability can I expect?",
  "Walk me through the escrow process",
  "I want to negotiate contract terms",
]

// ─── QUICK CAROUSEL ───────────────────────────────────────────────────────────
function QuickCarousel({ onQuickAction }) {
  const doubled = [...QUICK_ACTIONS, ...QUICK_ACTIONS]
  return (
    <div style={{ overflowX: 'hidden', overflowY: 'visible', width: '100%', paddingBottom: '4px' }}>
      <div
        style={{ display: 'flex', animation: 'carouselScroll 18s linear infinite', willChange: 'transform' }}
        onMouseEnter={e => { e.currentTarget.style.animationPlayState = 'paused' }}
        onMouseLeave={e => { e.currentTarget.style.animationPlayState = 'running' }}
      >
        {doubled.map((action, i) => (
          <div key={i} style={{ width: 200, flexShrink: 0, paddingRight: 12 }}>
            <button
              onClick={() => onQuickAction(action.message)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: '10px', textAlign: 'left',
                background: C.surface, border: `1px solid ${C.border}`, borderRadius: '10px',
                padding: '10px 12px', cursor: 'pointer', fontFamily: 'Plus Jakarta Sans, sans-serif',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)', transition: 'border-color 0.15s, background 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = C.indigo; e.currentTarget.style.background = `${C.indigo}05` }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.background = C.surface }}
            >
              <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: `${C.indigo}12`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {action.icon(C.indigo)}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{action.label}</div>
                <div style={{ fontSize: '10px', color: C.muted, marginTop: '1px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{action.description}</div>
              </div>
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── SETUP CARD ───────────────────────────────────────────────────────────────
const cardBase = {
  background: C.surface, border: `1px solid ${C.border}`, borderRadius: '12px',
  padding: '16px', cursor: 'pointer', textAlign: 'left', flex: '1 1 148px', maxWidth: '190px',
  fontFamily: 'Plus Jakarta Sans, sans-serif', transition: 'border-color 0.15s, box-shadow 0.15s',
  boxShadow: '0 1px 4px rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column', gap: '8px',
}

function SetupCard({ icon, title, description, onClick, href }) {
  const hoverIn  = e => { e.currentTarget.style.borderColor = C.indigo; e.currentTarget.style.boxShadow = `0 2px 10px ${C.indigo}18` }
  const hoverOut = e => { e.currentTarget.style.borderColor = C.border;  e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.04)' }
  const inner = (
    <>
      <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: `${C.indigo}12`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: '12px', fontWeight: 700, color: C.text, marginBottom: '2px' }}>{title}</div>
        <div style={{ fontSize: '11px', color: C.muted, lineHeight: 1.5 }}>{description}</div>
      </div>
      <div style={{ fontSize: '13px', color: C.muted, marginTop: 'auto' }}>→</div>
    </>
  )
  return href
    ? <Link href={href} className="agent-setup-card" style={{ ...cardBase, textDecoration: 'none' }} onMouseEnter={hoverIn} onMouseLeave={hoverOut}>{inner}</Link>
    : <button onClick={onClick} className="agent-setup-card" style={cardBase} onMouseEnter={hoverIn} onMouseLeave={hoverOut}>{inner}</button>
}

// ─── CHOOSE STEP ─────────────────────────────────────────────────────────────
function ChooseStep({ onQuickAction, onStart }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', width: '100%', maxWidth: '580px' }}>
      <AgentAvatar size={52} />
      <h2 style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.03em', margin: '14px 0 6px', color: C.text, fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
        Hi, I&apos;m the OutcomeX Agent
      </h2>
      <p style={{ fontSize: '13px', color: C.muted, lineHeight: 1.7, margin: '0 0 24px', maxWidth: '360px', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
        I underwrite performance contracts and run Meta Ads campaigns. Tell me your ROAS target — I&apos;ll evaluate the deal.
      </p>

      <div className="agent-setup-cards">
        <SetupCard
          onClick={onStart}
          title="New Contract"
          description="Set ROAS target, fee & time window"
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.indigo} strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>}
        />
        <SetupCard
          href="/contracts"
          title="My Contracts"
          description="View existing contracts and status"
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.indigo} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>}
        />
        <SetupCard
          href="/settings"
          title="Connect Ad Account"
          description="Link Meta Ads for campaign context"
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.indigo} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3"/></svg>}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%', marginBottom: '16px' }}>
        <div style={{ flex: 1, height: '1px', background: C.border }} />
        <span style={{ fontSize: '11px', color: C.muted, fontWeight: 600, whiteSpace: 'nowrap', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>or start with a goal</span>
        <div style={{ flex: 1, height: '1px', background: C.border }} />
      </div>

      <QuickCarousel onQuickAction={onQuickAction} />
    </div>
  )
}

// ─── THINKING BLOCK ───────────────────────────────────────────────────────────
const ThinkingStep = React.memo(
  function ThinkingStep({ step, isActive, liveDetail }) {
    const displayDetail = isActive ? liveDetail : step.detail
    return (
      <div style={{ paddingTop: '6px', marginTop: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: C.sub }}>
          <span style={{ fontWeight: 500 }}>{step.label}</span>
          {!step.isComplete
            ? <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: C.indigo, opacity: 0.7, animation: 'agentThinkPulse 1s infinite', marginLeft: 'auto', flexShrink: 0 }} />
            : <span style={{ marginLeft: 'auto', color: C.green, fontSize: '10px', flexShrink: 0 }}>✓</span>
          }
        </div>
        {displayDetail && (
          <div style={{
            marginTop: '6px', paddingLeft: '10px', borderLeft: `2px solid ${C.indigo}30`,
            fontSize: '11px', color: C.sub, lineHeight: 1.6, whiteSpace: 'pre-wrap',
            ...(!isActive ? { maxHeight: '88px', overflowY: 'auto' } : {}),
          }}>
            {displayDetail}
            {isActive && <span style={{ opacity: 0.4 }}>▌</span>}
          </div>
        )}
      </div>
    )
  },
  (prev, next) => {
    if (prev.isActive || next.isActive) return false
    if (prev.step.isComplete && next.step.isComplete) return prev.step.detail === next.step.detail
    return prev.step.detail === next.step.detail && prev.step.isComplete === next.step.isComplete
  }
)

function ThinkingBlock({ thinking, activeStepId, liveDetail, onToggle }) {
  if (!thinking || thinking.steps.length === 0) return null
  return (
    <div style={{ margin: '8px 0', borderRadius: '8px', overflow: 'hidden', fontSize: '12px', background: 'transparent' }}>
      <div onClick={onToggle} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', cursor: 'pointer', userSelect: 'none' }}>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ flexShrink: 0, transform: thinking.isOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>
          <path d="M3 2l4 3-4 3" stroke={C.muted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <span style={{ color: C.sub, fontWeight: 500 }}>
          {thinking.isComplete
            ? `Evaluated in ${thinking.steps.length} step${thinking.steps.length !== 1 ? 's' : ''}`
            : 'Evaluating...'
          }
        </span>
        {!thinking.isComplete && <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: C.indigo, animation: 'agentThinkPulse 1s infinite', marginLeft: 'auto', flexShrink: 0 }} />}
      </div>
      {thinking.isOpen && (
        <div style={{ padding: '8px 12px' }}>
          {thinking.steps.map(step => (
            <ThinkingStep
              key={step.id}
              step={step}
              isActive={step.id === activeStepId}
              liveDetail={step.id === activeStepId ? liveDetail : ''}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── MESSAGE BUBBLE ───────────────────────────────────────────────────────────
const AgentMessage = React.memo(function AgentMessage({ msg, msgIndex, activeStepId, liveDetail, onThinkingToggle }) {
  if (msg.role === 'user') {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'flex-start', gap: '10px' }}>
        <div style={{
          maxWidth: '76%', background: C.userBg, color: '#fff',
          padding: '11px 15px', borderRadius: '16px 16px 4px 16px',
          fontSize: '13px', lineHeight: 1.65, boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        }}>
          {msg.content}
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'flex-start', gap: '10px' }}>
      <div style={{ maxWidth: '100%', width: '100%', background: 'transparent', color: C.text, padding: '0', fontSize: '13px', lineHeight: 1.65 }}>
        {msg.acknowledgment && <p style={{ margin: '0 0 8px 0' }}>{msg.acknowledgment}</p>}
        {msg.thinking && msg.ackDone !== false && (
          <div data-thinking-toggle={msgIndex}>
            <ThinkingBlock thinking={msg.thinking} activeStepId={activeStepId} liveDetail={liveDetail} onToggle={() => onThinkingToggle(msgIndex)} />
          </div>
        )}
        {msg.content && (
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
            p:      ({ children }) => <p style={{ margin: '0 0 8px' }}>{children}</p>,
            ul:     ({ children }) => <ul style={{ margin: '4px 0 8px', paddingLeft: '18px' }}>{children}</ul>,
            ol:     ({ children }) => <ol style={{ margin: '4px 0 8px', paddingLeft: '18px' }}>{children}</ol>,
            li:     ({ children }) => <li style={{ marginBottom: '3px' }}>{children}</li>,
            strong: ({ children }) => <strong style={{ fontWeight: 700, color: 'inherit' }}>{children}</strong>,
            hr:     () => <hr style={{ border: 'none', borderTop: `1px solid ${C.border}`, margin: '10px 0' }} />,
            h3:     ({ children }) => <p style={{ margin: '0 0 6px', fontWeight: 700 }}>{children}</p>,
            code:   ({ inline, children }) => inline
              ? <code style={{ background: C.surfaceAlt, padding: '1px 5px', borderRadius: '4px', fontSize: '12px', fontFamily: 'monospace' }}>{children}</code>
              : <pre style={{ background: C.surfaceAlt, padding: '10px 12px', borderRadius: '8px', overflowX: 'auto', fontSize: '12px', margin: '6px 0' }}><code>{children}</code></pre>,
            table:  ({ children }) => <div style={{ overflowX: 'auto', margin: '8px 0' }}><table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '12px' }}>{children}</table></div>,
            thead:  ({ children }) => <thead style={{ background: C.surfaceAlt }}>{children}</thead>,
            th:     ({ children }) => <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 700, color: C.sub, borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' }}>{children}</th>,
            td:     ({ children }) => <td style={{ padding: '5px 10px', borderBottom: `1px solid ${C.border}`, color: C.sub, verticalAlign: 'top' }}>{children}</td>,
          }}>
            {msg.content}
          </ReactMarkdown>
        )}
      </div>
    </div>
  )
})

// ─── PAGE ─────────────────────────────────────────────────────────────────────
export default function ContractChatPage() {
  const openMobileSidebar = useOpenMobileSidebar()
  const { isSignedIn, isLoaded } = useAuth()
  const { openSignIn }            = useClerk()
  const [messages,     setMessages]     = React.useState([])
  const [loading,      setLoading]      = React.useState(false)
  const [liveDetail,   setLiveDetail]   = React.useState('')
  const [activeStepId, setActiveStepId] = React.useState(null)
  const [chatStep,     setChatStep]     = React.useState('choose') // 'choose' | 'ready'
  const [inputKey,     setInputKey]     = React.useState(0)
  const [isMobile,     setIsMobile]     = React.useState(false)

  const scrollRef          = React.useRef(null)
  const mobileInputRef     = React.useRef(null)
  const desktopInputRef    = React.useRef(null)
  const sendMsgRef         = React.useRef(null)
  const streamingDetailRef = React.useRef('')
  const abortControllerRef = React.useRef(null)
  const [isStreaming,      setIsStreaming]     = React.useState(false)
  const [inputAreaHeight,  setInputAreaHeight] = React.useState(120)

  const stopStream = React.useCallback(() => {
    abortControllerRef.current?.abort()
  }, [])

  React.useLayoutEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Track input bar height for padding the scroll area
  React.useEffect(() => {
    const update = () => {
      const mH = mobileInputRef.current?.offsetHeight || 0
      const dH = desktopInputRef.current?.offsetHeight || 0
      const h = Math.max(mH, dH)
      if (h > 0) setInputAreaHeight(h)
    }
    const ro = new ResizeObserver(update)
    if (mobileInputRef.current)  ro.observe(mobileInputRef.current)
    if (desktopInputRef.current) ro.observe(desktopInputRef.current)
    update()
    return () => ro.disconnect()
  }, [chatStep])

  // Auto-scroll to bottom on new messages
  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, loading])

  const handleThinkingToggle = React.useCallback((msgIndex) => {
    setMessages(prev => {
      const msgs = [...prev]
      const msg = { ...msgs[msgIndex] }
      msg.thinking = { ...msg.thinking, isOpen: !msg.thinking.isOpen }
      msgs[msgIndex] = msg
      return msgs
    })
  }, [])

  const sendMessage = async (text) => {
    if (!text?.trim() || loading) return

    // Require sign-in before sending any message to the agent
    if (isLoaded && !isSignedIn) {
      openSignIn({ afterSignInUrl: window.location.href })
      return
    }

    if (chatStep === 'choose') setChatStep('ready')

    const userMsg = { role: 'user', content: text.trim() }
    const updated = [...messages, userMsg]
    setMessages(updated)
    setLoading(true)

    const controller = new AbortController()
    abortControllerRef.current = controller

    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text.trim() }),
        signal: controller.signal,
      })

      if (!res.ok) throw new Error('Agent unavailable')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let fullText = ''
      let streamingStarted = false
      let lastFlushTime = 0

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const blocks = buffer.split('\n\n')
        buffer = blocks.pop() ?? ''

        for (const block of blocks) {
          let eventType = 'message'
          let eventData = ''
          for (const line of block.split('\n')) {
            if (line.startsWith('event: ')) eventType = line.slice(7).trim()
            else if (line.startsWith('data: '))  eventData = line.slice(6).trim()
          }
          if (!eventData) continue

          let data
          try { data = JSON.parse(eventData) } catch { continue }

          if (eventType === 'acknowledgment') {
            setMessages(prev => [...prev, {
              role: 'assistant', acknowledgment: data.sentence || '',
              ackDone: true, content: '',
              thinking: { isOpen: true, isComplete: false, steps: [] },
            }])
            setLoading(false)

          } else if (eventType === 'thinking_step_start') {
            streamingDetailRef.current = ''
            setLiveDetail('')
            setActiveStepId(data.step_id)
            setMessages(prev => {
              const msgs = [...prev]
              const last = { ...msgs[msgs.length - 1] }
              last.thinking = { ...last.thinking, steps: [...last.thinking.steps, { id: data.step_id, label: data.label, detail: '', isComplete: false }] }
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
              last.thinking = { ...last.thinking, steps: last.thinking.steps.map(s => s.id === data.step_id ? { ...s, detail: committed, isComplete: true } : s) }
              msgs[msgs.length - 1] = last
              return msgs
            })

          } else if (eventType === 'thinking_end') {
            setMessages(prev => {
              const msgs = [...prev]
              const last = { ...msgs[msgs.length - 1] }
              last.thinking = { ...last.thinking, isComplete: true, isOpen: false }
              msgs[msgs.length - 1] = last
              return msgs
            })

          } else if (eventType === 'text') {
            if (!streamingStarted) { streamingStarted = true; setLoading(false); setIsStreaming(true) }
            fullText += data.delta || ''
            // Throttle to 150ms so ReactMarkdown doesn't re-parse on every token
            const now = Date.now()
            if (now - lastFlushTime >= 150) {
              lastFlushTime = now
              setMessages(prev => {
                const msgs = [...prev]
                const last = msgs[msgs.length - 1]
                if (last?.role === 'assistant') msgs[msgs.length - 1] = { ...last, content: fullText }
                else msgs.push({ role: 'assistant', acknowledgment: '', ackDone: true, content: fullText, thinking: null })
                return msgs
              })
            }

          } else if (eventType === 'error') {
            throw new Error(data.message || 'Agent error')
          }
        }
      }
      // Final flush — ensure last tokens are visible after the throttle window
      if (fullText) {
        setMessages(prev => {
          const msgs = [...prev]
          const last = msgs[msgs.length - 1]
          if (last?.role === 'assistant') msgs[msgs.length - 1] = { ...last, content: fullText }
          else msgs.push({ role: 'assistant', acknowledgment: '', ackDone: true, content: fullText, thinking: null })
          return msgs
        })
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        // User stopped — leave partial content, clean up state silently
        setLoading(false)
        setIsStreaming(false)
        setLiveDetail('')
        setActiveStepId(null)
        streamingDetailRef.current = ''
        return
      }
      setLoading(false)
      setIsStreaming(false)
      setLiveDetail('')
      setActiveStepId(null)
      streamingDetailRef.current = ''
      const isNetworkError = !err?.message || err.message.includes('fetch') || err.message === 'Agent unavailable'
      setMessages(prev => [...prev, {
        role: 'assistant', acknowledgment: '', ackDone: true, thinking: null,
        content: isNetworkError
          ? "I'm not connected to the backend yet. Once the API is live, I'll evaluate your contract terms, estimate success probability, and walk you through the escrow process."
          : err.message,
      }])
    } finally {
      setIsStreaming(false)
      setLoading(false)
      setLiveDetail('')
      setActiveStepId(null)
      streamingDetailRef.current = ''
    }
  }

  sendMsgRef.current = sendMessage

  const handleSendStable = React.useCallback((text) => sendMsgRef.current?.(text), [])

  const handleQuickAction = (message) => {
    const msgs = [{
      role: 'assistant', acknowledgment: '', ackDone: true, thinking: null,
      content: "Got it — let's work on this. I'll evaluate the terms and give you my underwriting decision.",
    }]
    setMessages(msgs)
    setChatStep('ready')
    setTimeout(() => sendMsgRef.current?.(message), 100)
  }

  const handleStart = () => {
    const msgs = [{
      role: 'assistant', acknowledgment: '', ackDone: true, thinking: null,
      content: "Great! Let's set up your performance contract.\n\nTell me:\n1. **Target ROAS** (e.g. ≥ 2.0×)\n2. **Minimum ad spend** before resolution is valid (e.g. $500)\n3. **Time window** in days (e.g. 7 days)\n4. **Success fee** in USDC (e.g. 100 USDC)\n\nYou can also just describe your campaign and I'll suggest terms.",
    }]
    setMessages(msgs)
    setChatStep('ready')
  }

  const reset = () => {
    setMessages([])
    setChatStep('choose')
    setInputKey(k => k + 1)
    setLiveDetail('')
    setActiveStepId(null)
    streamingDetailRef.current = ''
  }

  const chatReady = true
  const lastMsgIdx = messages.length - 1

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ── Header ── */}
      <div className="agent-app-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', height: '56px', background: C.surface, borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        {/* Mobile menu btn */}
        <button onClick={openMobileSidebar} className="app-mobile-menu-btn" style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.text, padding: '4px', display: 'none', alignItems: 'center' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/><path d="M13 9l3 3-3 3"/></svg>
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <AgentAvatar size={24} />
          <span style={{ fontSize: '14px', fontWeight: 700, color: C.text, fontFamily: 'Plus Jakarta Sans, sans-serif' }}>OutcomeX Agent</span>
          <span style={{ fontSize: '10px', fontWeight: 600, color: C.green, background: '#f0fdf4', padding: '2px 8px', borderRadius: '20px' }}>Underwriting</span>
        </div>

        {chatStep === 'ready' && (
          <button
            onClick={reset}
            style={{ fontSize: '12px', fontWeight: 600, color: C.muted, background: 'none', border: `1px solid ${C.border}`, borderRadius: '7px', padding: '5px 12px', cursor: 'pointer', fontFamily: 'Plus Jakarta Sans, sans-serif', transition: 'border-color 0.15s, color 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = C.indigo; e.currentTarget.style.color = C.indigo }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.muted }}
          >
            + New
          </button>
        )}
      </div>

      {/* ── Body ── */}
      <div className="agent-body">
        <div className="agent-chat-panel" style={{ position: 'relative', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: C.surface }}>

          {/* Choose step overlay */}
          {chatStep === 'choose' && (
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, bottom: inputAreaHeight,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              padding: '32px 24px', overflowY: 'auto', zIndex: 5, background: C.surface,
            }}>
              <ChooseStep onQuickAction={handleQuickAction} onStart={handleStart} />
            </div>
          )}

          {/* Message list */}
          <div
            ref={scrollRef}
            className="agent-msgs-area"
            style={{ flex: 1, overflowY: 'auto', overflowAnchor: 'none', paddingBottom: `${inputAreaHeight + 16}px` }}
          >
            {messages.map((msg, i) => (
              <div key={i} style={{ maxWidth: '720px', margin: '0 auto', width: '100%', padding: '0 16px 16px' }}>
                <AgentMessage
                  msg={msg}
                  msgIndex={i}
                  activeStepId={i === lastMsgIdx ? activeStepId : null}
                  liveDetail={i === lastMsgIdx ? liveDetail : ''}
                  onThinkingToggle={handleThinkingToggle}
                />
              </div>
            ))}

            {/* Starters — shown after first agent message */}
            {messages.length === 1 && !loading && (
              <div style={{ maxWidth: '720px', margin: '0 auto', width: '100%', padding: '0 16px 16px' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Suggested responses</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {STARTERS.map((s, i) => (
                    <button key={i} onClick={() => sendMessage(s)}
                      style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: C.sub, cursor: 'pointer', fontFamily: 'Plus Jakarta Sans, sans-serif', transition: 'border-color 0.15s', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = C.indigo}
                      onMouseLeave={e => e.currentTarget.style.borderColor = C.border}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Loading dots */}
            {loading && (
              <div style={{ maxWidth: '720px', margin: '0 auto', width: '100%', padding: '0 16px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 0' }}>
                  {[0, 1, 2].map(i => (
                    <span key={i} style={{ display: 'inline-block', width: '7px', height: '7px', borderRadius: '50%', background: C.indigo, animation: 'agentDotBounce 1.1s ease-in-out infinite', animationDelay: `${i * 0.18}s` }} />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── Mobile input ── */}
          <div ref={mobileInputRef} className="agent-input-mobile" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '32px 14px 20px', background: 'linear-gradient(to bottom, transparent, #ffffff 35%)' }}>
            <AgentInputBar
              key={inputKey}
              onSend={handleSendStable}
              onStop={stopStream}
              isGenerating={loading || isStreaming}
              chatReady={chatReady}
              loading={loading}
              placeholder={chatReady ? "Describe your contract or ask a question…" : "Choose an option above to get started…"}
              fontSize="16px"
              paddingLeft="16px"
            />
          </div>

          {/* ── Desktop input ── */}
          <div ref={desktopInputRef} className="agent-input-desktop" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '40px 40px 16px', background: 'linear-gradient(to bottom, transparent, #ffffff 35%)' }}>
            <div style={{ maxWidth: '720px', margin: '0 auto' }}>
              <AgentInputBar
                key={inputKey}
                onSend={handleSendStable}
                onStop={stopStream}
                isGenerating={loading || isStreaming}
                chatReady={chatReady}
                loading={loading}
                placeholder={chatReady ? "Describe your ROAS target, budget, and time window…" : "Select or add a brand above to get started…"}
                fontSize="13px"
                paddingLeft="18px"
              />
            </div>
            <div style={{ fontSize: '11px', color: C.muted, marginTop: '8px', textAlign: 'center' }}>
              {isLoaded && !isSignedIn
                ? <><button onClick={() => openSignIn({ afterSignInUrl: window.location.href })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.indigo, fontWeight: 600, fontSize: '11px', padding: 0, fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Sign in</button>{' to start chatting with the agent'}</>
                : 'Enter to send · Shift+Enter for new line'
              }
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
