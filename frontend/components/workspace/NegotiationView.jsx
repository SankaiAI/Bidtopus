'use client'
import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useClerk } from '@clerk/nextjs'
import AgentInputBar from '@/components/AgentInputBar'
import { generateSessionId } from '@/lib/workspaceSessions'
import { useNegotiationStream } from '@/hooks/useNegotiationStream'
import ThinkingBlock from './ThinkingBlock'
import WorkspaceHeader from './WorkspaceHeader'
import { C, font } from './constants'

// ─── WELCOME SCREEN ───────────────────────────────────────────────────────────
const QUICK_ACTIONS = [
  { label: 'ROAS ≥ 2.0 contract', description: '7 days · 100 USDC fee', message: 'Create a contract: ROAS ≥ 2.0, $500 min spend, 7-day window, 100 USDC fee', icon: color => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill={color} stroke="none"/></svg> },
  { label: 'Evaluate my campaign', description: 'Get success probability', message: 'Evaluate my Meta Ads campaign — what ROAS can I realistically expect?', icon: color => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="2.8"/></svg> },
  { label: 'Best terms for budget', description: 'Optimize contract parameters', message: 'What contract terms give me the best chance of success with a $500 ad spend?', icon: color => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg> },
  { label: 'Review ad strategy', description: 'Evaluate proposed campaign plan', message: 'Review the proposed Meta Ads retargeting strategy and tell me if it will hit my ROAS target', icon: color => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg> },
]

const STARTERS = [
  'Create a ROAS ≥ 2.0 contract for 7 days',
  'What success probability can I expect?',
  'Walk me through the escrow process',
  'I want to negotiate contract terms',
]

function QuickCarousel({ onQuickAction }) {
  const doubled = [...QUICK_ACTIONS, ...QUICK_ACTIONS]
  return (
    <div style={{ overflowX: 'hidden', width: '100%', paddingBottom: '4px' }}>
      <div style={{ display: 'flex', animation: 'carouselScroll 18s linear infinite', willChange: 'transform' }}
        onMouseEnter={e => { e.currentTarget.style.animationPlayState = 'paused' }}
        onMouseLeave={e => { e.currentTarget.style.animationPlayState = 'running' }}>
        {doubled.map((action, i) => (
          <div key={i} style={{ width: 200, flexShrink: 0, paddingRight: 12 }}>
            <button onClick={() => onQuickAction(action.message)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', textAlign: 'left', background: C.surface, border: `1px solid ${C.border}`, borderRadius: '10px', padding: '10px 12px', cursor: 'pointer', fontFamily: font, boxShadow: '0 1px 3px rgba(0,0,0,0.04)', transition: 'border-color 0.15s, background 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = C.indigo; e.currentTarget.style.background = C.indigoBg }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.background = C.surface }}>
              <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: C.indigoBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{action.icon(C.indigo)}</div>
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

function SetupCard({ icon, title, description, onClick, href }) {
  const cardStyle = { background: C.surface, border: `1px solid ${C.border}`, borderRadius: '12px', padding: '16px', cursor: 'pointer', textAlign: 'left', flex: '1 1 148px', maxWidth: '190px', fontFamily: font, transition: 'border-color 0.15s, box-shadow 0.15s', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column', gap: '8px' }
  const hoverIn  = e => { e.currentTarget.style.borderColor = C.indigo; e.currentTarget.style.boxShadow = `0 2px 10px ${C.indigoBg}` }
  const hoverOut = e => { e.currentTarget.style.borderColor = C.border;  e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.04)' }
  const inner = (<><div style={{ width: '32px', height: '32px', borderRadius: '8px', background: C.indigoBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{icon}</div><div><div style={{ fontSize: '12px', fontWeight: 700, color: C.text, marginBottom: '2px' }}>{title}</div><div style={{ fontSize: '11px', color: C.muted, lineHeight: 1.5 }}>{description}</div></div><div style={{ fontSize: '13px', color: C.muted, marginTop: 'auto' }}>→</div></>)
  return href
    ? <Link href={href} className="agent-setup-card" style={{ ...cardStyle, textDecoration: 'none' }} onMouseEnter={hoverIn} onMouseLeave={hoverOut}>{inner}</Link>
    : <button onClick={onClick} className="agent-setup-card" style={cardStyle} onMouseEnter={hoverIn} onMouseLeave={hoverOut}>{inner}</button>
}

function WelcomeScreen({ onQuickAction, onStart }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', width: '100%', maxWidth: '580px' }}>
      <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: C.indigoBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill={C.indigo} /><circle cx="12" cy="12" r="5" stroke="white" strokeWidth="1.5" fill="none" /><circle cx="12" cy="12" r="1.5" fill="white" /></svg>
      </div>
      <h2 style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.03em', margin: '14px 0 6px', color: C.text, fontFamily: font }}>Hi, I&apos;m the OutcomeX Agent</h2>
      <p style={{ fontSize: '13px', color: C.muted, lineHeight: 1.7, margin: '0 0 24px', maxWidth: '360px', fontFamily: font }}>I underwrite performance contracts and run Meta Ads campaigns. Tell me your ROAS target — I&apos;ll evaluate the deal.</p>
      <div className="agent-setup-cards">
        <SetupCard onClick={onStart} title="New Contract" description="Set ROAS target, fee & time window" icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.indigo} strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>} />
        <SetupCard href="/contracts" title="My Contracts" description="View existing contracts and status" icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.indigo} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>} />
        <SetupCard href="/settings" title="Connect Ad Account" description="Link Meta Ads for campaign context" icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.indigo} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3"/></svg>} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%', marginBottom: '16px' }}>
        <div style={{ flex: 1, height: '1px', background: C.border }} />
        <span style={{ fontSize: '11px', color: C.muted, fontWeight: 600, whiteSpace: 'nowrap', fontFamily: font }}>or start with a goal</span>
        <div style={{ flex: 1, height: '1px', background: C.border }} />
      </div>
      <QuickCarousel onQuickAction={onQuickAction} />
    </div>
  )
}

// ─── MESSAGE BUBBLES ──────────────────────────────────────────────────────────
const MD_COMPONENTS = {
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
}

const NegotiationMessage = React.memo(function NegotiationMessage({ msg, msgIndex, activeStepId, liveDetail, onThinkingToggle }) {
  if (msg.role === 'user') {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <div style={{ maxWidth: '76%', background: C.userBg, color: '#fff', padding: '11px 15px', borderRadius: '16px 16px 4px 16px', fontSize: '13px', lineHeight: 1.65, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          {msg.content}
        </div>
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
      <div style={{ width: 26, height: 26, borderRadius: 8, background: C.indigoBg, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '1px' }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.indigo} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>
      </div>
      <div style={{ flex: 1, color: C.text, fontSize: '13px', lineHeight: 1.65 }}>
        {msg.acknowledgment && <p style={{ margin: '0 0 8px' }}>{msg.acknowledgment}</p>}
        {msg.thinking && msg.ackDone !== false && (
          <ThinkingBlock thinking={msg.thinking} activeStepId={activeStepId} liveDetail={liveDetail} onToggle={() => onThinkingToggle(msgIndex)} />
        )}
        {msg.content && <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>{msg.content}</ReactMarkdown>}
      </div>
    </div>
  )
})

// ─── NEGOTIATION VIEW ─────────────────────────────────────────────────────────
export default function NegotiationView({ sessionId, onFinalized }) {
  const router = useRouter()
  const { openSignIn } = useClerk()

  const {
    messages, setMessages, loading, isStreaming, liveDetail, activeStepId,
    title, contractId, chatStep, setChatStep,
    sendMessage, stopStream, saveTitle,
    isSignedIn, isLoaded,
  } = useNegotiationStream(sessionId, {
    onContractCreated: onFinalized,
  })

  const [inputAreaHeight, setInputAreaHeight] = React.useState(120)
  const [isMobile, setIsMobile] = React.useState(false)
  const [inputKey, setInputKey] = React.useState(0)
  const scrollRef       = React.useRef(null)
  const mobileInputRef  = React.useRef(null)
  const desktopInputRef = React.useRef(null)
  const sendMsgRef      = React.useRef(null)
  const suppressScrollRef = React.useRef(false)

  React.useLayoutEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  React.useEffect(() => {
    const update = () => {
      const h = Math.max(mobileInputRef.current?.offsetHeight || 0, desktopInputRef.current?.offsetHeight || 0)
      if (h > 0) setInputAreaHeight(h)
    }
    const ro = new ResizeObserver(update)
    if (mobileInputRef.current)  ro.observe(mobileInputRef.current)
    if (desktopInputRef.current) ro.observe(desktopInputRef.current)
    update()
    return () => ro.disconnect()
  }, [chatStep])

  React.useEffect(() => {
    if (suppressScrollRef.current) { suppressScrollRef.current = false; return }
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, loading])

  const handleThinkingToggle = React.useCallback((msgIndex) => {
    suppressScrollRef.current = true
    setMessages(prev => {
      const msgs = [...prev]
      const msg = { ...msgs[msgIndex] }
      msg.thinking = { ...msg.thinking, isOpen: !msg.thinking.isOpen }
      msgs[msgIndex] = msg
      return msgs
    })
  }, [setMessages])

  const handleSend = React.useCallback(async (text) => {
    if (!text?.trim() || loading) return
    if (isLoaded && !isSignedIn) { openSignIn({ afterSignInUrl: window.location.href }); return }
    await sendMessage(text)
  }, [loading, isLoaded, isSignedIn, openSignIn, sendMessage])

  const handleQuickAction = (message) => {
    setMessages([{ role: 'assistant', acknowledgment: '', ackDone: true, thinking: null, content: "Got it — let's work on this. I'll evaluate the terms and give you my underwriting decision." }])
    setChatStep('ready')
    setTimeout(() => handleSend(message), 100)
  }

  const handleStart = () => {
    setMessages([{ role: 'assistant', acknowledgment: '', ackDone: true, thinking: null, content: "Great! Let's set up your performance contract.\n\nTell me:\n1. **Target ROAS** (e.g. ≥ 2.0×)\n2. **Minimum ad spend** before resolution is valid (e.g. $500)\n3. **Time window** in days (e.g. 7 days)\n4. **Success fee** in USDC (e.g. 100 USDC)\n\nYou can also just describe your campaign and I'll suggest terms." }])
    setChatStep('ready')
  }

  sendMsgRef.current = handleSend
  const stableSend = React.useCallback((t) => sendMsgRef.current?.(t), [])

  const lastMsgIdx = messages.length - 1

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      <WorkspaceHeader
        title={title}
        contractId={contractId}
        onTitleSave={saveTitle}
        onNew={chatStep === 'ready' ? () => router.push(`/workspace/${generateSessionId()}`) : null}
      />

      {/* Mobile header */}
      <div className="app-mobile-header">
        <span style={{ fontSize: '15px', fontWeight: 700, color: C.text, flex: 1, fontFamily: font, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
      </div>

      <div className="agent-body">
        <div className="agent-chat-panel" style={{ position: 'relative', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: C.surface }}>

          {chatStep === 'choose' && (
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: inputAreaHeight, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 24px', overflowY: 'auto', zIndex: 5, background: C.surface }}>
              <WelcomeScreen onQuickAction={handleQuickAction} onStart={handleStart} />
            </div>
          )}

          <div ref={scrollRef} className="agent-msgs-area" style={{ flex: 1, overflowY: 'auto', overflowAnchor: 'none', paddingBottom: `${inputAreaHeight + 16}px` }}>
            {messages.map((msg, i) => (
              <div key={i} style={{ maxWidth: '720px', margin: '0 auto', width: '100%', padding: '0 16px 16px' }}>
                <NegotiationMessage msg={msg} msgIndex={i} activeStepId={i === lastMsgIdx ? activeStepId : null} liveDetail={i === lastMsgIdx ? liveDetail : ''} onThinkingToggle={handleThinkingToggle} />
              </div>
            ))}

            {messages.length === 1 && !loading && (
              <div style={{ maxWidth: '720px', margin: '0 auto', width: '100%', padding: '0 16px 16px' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Suggested responses</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {STARTERS.map((s, i) => (
                    <button key={i} onClick={() => stableSend(s)} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: C.sub, cursor: 'pointer', fontFamily: font, transition: 'border-color 0.15s', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = C.indigo}
                      onMouseLeave={e => e.currentTarget.style.borderColor = C.border}>{s}</button>
                  ))}
                </div>
              </div>
            )}

            {loading && (
              <div style={{ maxWidth: '720px', margin: '0 auto', width: '100%', padding: '0 16px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 0' }}>
                  {[0, 1, 2].map(i => <span key={i} style={{ display: 'inline-block', width: '7px', height: '7px', borderRadius: '50%', background: C.indigo, animation: 'agentDotBounce 1.1s ease-in-out infinite', animationDelay: `${i * 0.18}s` }} />)}
                </div>
              </div>
            )}
          </div>

          <div ref={mobileInputRef} className="agent-input-mobile" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '32px 14px 20px', background: `linear-gradient(to bottom, transparent, ${C.surface} 35%)` }}>
            <AgentInputBar key={inputKey} onSend={stableSend} onStop={stopStream} isGenerating={loading || isStreaming} chatReady loading={loading} placeholder="Describe your ROAS target, budget, and time window…" fontSize="16px" paddingLeft="16px" />
          </div>

          <div ref={desktopInputRef} className="agent-input-desktop" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '40px 40px 16px', background: `linear-gradient(to bottom, transparent, ${C.surface} 35%)` }}>
            <div style={{ maxWidth: '720px', margin: '0 auto' }}>
              <AgentInputBar key={`d-${inputKey}`} onSend={stableSend} onStop={stopStream} isGenerating={loading || isStreaming} chatReady loading={loading} placeholder="Describe your ROAS target, budget, and time window…" fontSize="13px" paddingLeft="18px" />
            </div>
            <div style={{ fontSize: '11px', color: C.muted, marginTop: '8px', textAlign: 'center', fontFamily: font }}>
              {isLoaded && !isSignedIn
                ? <><button onClick={() => openSignIn({ afterSignInUrl: window.location.href })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.indigo, fontWeight: 600, fontSize: '11px', padding: 0, fontFamily: font }}>Sign in</button>{' to start chatting with the agent'}</>
                : 'Enter to send · Shift+Enter for new line'
              }
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
