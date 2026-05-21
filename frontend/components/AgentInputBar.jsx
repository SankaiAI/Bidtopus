'use client'
import React from 'react'

const ACCENT   = '#2563EB'
const BORDER   = '#e4e3ed'
const BG       = '#f0f0f5'
const TEXT     = '#0e0d1a'
const SEND_OFF = '#d1d0db'

const MAX_HEIGHT = 200   // px — beyond this the textarea scrolls instead of growing

/**
 * Auto-resizing chat input bar.
 *
 * Single-line: pill shape, textarea + send button sit in one flex row.
 * Multi-line:  textarea expands to full width; send button drops to the bottom-right.
 * Max height is capped at MAX_HEIGHT px; once reached the textarea scrolls.
 *
 * Props:
 *   onSend(text: string) — called when the user submits
 *   onStop() — called when user clicks Stop; replaces send button with red stop circle
 *   isGenerating: boolean — when true and onStop provided, send button becomes a stop button
 *   chatReady: boolean   — disables/grays the bar when false
 *   loading: boolean     — disables send while the agent is responding
 *   placeholder: string
 *   fontSize?: string    — defaults '13px'; pass '16px' on mobile to avoid iOS zoom
 *   paddingLeft?: string — left padding of the pill (default '18px')
 *   accentColor?: string — override the active border/send button color
 */
const AgentInputBar = React.memo(function AgentInputBar({
  onSend,
  onStop,
  isGenerating,
  chatReady,
  loading,
  placeholder,
  fontSize    = '13px',
  paddingLeft = '18px',
  accentColor = ACCENT,
}) {
  const [input,       setInput]       = React.useState('')
  const [isMultiLine, setIsMultiLine] = React.useState(false)
  const [focused,     setFocused]     = React.useState(false)
  const textareaRef = React.useRef(null)

  // ── Reset everything when input is cleared ──────────────────────────────────
  React.useEffect(() => {
    if (!input) {
      setIsMultiLine(false)
      const el = textareaRef.current
      if (el) {
        el.style.height = 'auto'
        el.style.overflowY = 'hidden'
      }
    }
  }, [input])

  // ── Resize textarea to fit content ──────────────────────────────────────────
  // Called on every keystroke. Resets to 'auto' first so scrollHeight shrinks
  // correctly when the user deletes lines.
  const autoResize = (el) => {
    if (!el) return
    el.style.height = 'auto'                                   // collapse first
    const h = el.scrollHeight
    el.style.height = Math.min(h, MAX_HEIGHT) + 'px'          // expand (capped)
    el.style.overflowY = h > MAX_HEIGHT ? 'scroll' : 'hidden' // scroll when capped
    setIsMultiLine(h > 32)                                     // > 1 line threshold
  }

  // ── Send ────────────────────────────────────────────────────────────────────
  const handleSend = () => {
    const text = input.trim()
    if (!text || loading || !chatReady) return
    setInput('')
    setIsMultiLine(false)
    const el = textareaRef.current
    if (el) { el.style.height = 'auto'; el.style.overflowY = 'hidden' }
    onSend(text)
    el?.focus()
  }

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  const sendDisabled = loading || !input.trim() || !chatReady
  const borderColor  = (focused || input) ? accentColor : BORDER

  // ── Action button: stop (while generating) or send ──────────────────────────
  const ActionBtn = (isGenerating && onStop) ? (
    <button
      onClick={onStop}
      aria-label="Stop generating"
      style={{
        width: '34px', height: '34px', flexShrink: 0,
        background: '#EF4444',
        border: 'none', borderRadius: '50%',
        cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background 0.2s',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = '#dc2626' }}
      onMouseLeave={e => { e.currentTarget.style.background = '#EF4444' }}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="#fff">
        <rect x="4" y="4" width="16" height="16" rx="2" />
      </svg>
    </button>
  ) : (
    <button
      onClick={handleSend}
      disabled={sendDisabled}
      aria-label="Send"
      style={{
        width: '34px', height: '34px', flexShrink: 0,
        background: sendDisabled ? SEND_OFF : accentColor,
        border: 'none', borderRadius: '50%',
        cursor: sendDisabled ? 'default' : 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background 0.2s',
      }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 19V5M5 12l7-7 7 7"/>
      </svg>
    </button>
  )

  // ── Pill container ───────────────────────────────────────────────────────────
  // Layout differs between single-line and multi-line:
  //   single → flex row  (textarea + send side by side)
  //   multi  → block     (textarea full-width, send pinned bottom-right)
  return (
    <div
      style={{
        background: BG,
        border: `1.5px solid ${borderColor}`,
        borderRadius: '24px',
        boxShadow: focused ? `0 0 0 3px ${accentColor}18, 0 2px 12px rgba(0,0,0,0.07)` : '0 2px 12px rgba(0,0,0,0.07)',
        opacity: chatReady ? 1 : 0.45,
        pointerEvents: chatReady ? 'auto' : 'none',
        transition: 'border-color 0.18s, box-shadow 0.18s',
        // ── layout ──
        ...(isMultiLine
          ? { padding: `12px 14px 10px ${paddingLeft}` }
          : { display: 'flex', alignItems: 'center', gap: '8px', padding: `9px 9px 9px ${paddingLeft}` }
        ),
      }}
    >
      <textarea
        ref={textareaRef}
        value={input}
        rows={1}
        disabled={!chatReady || isGenerating}
        placeholder={isGenerating ? 'Agent is responding…' : placeholder}
        className="agent-input"
        onChange={(e) => {
          setInput(e.target.value)
          autoResize(e.target)
        }}
        onKeyDown={handleKey}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          // layout depends on single vs multi-line mode
          ...(isMultiLine ? { display: 'block', width: '100%' } : { flex: 1 }),
          background: 'transparent',
          border: 'none',
          outline: 'none',
          color: TEXT,
          fontSize,
          fontFamily: 'Plus Jakarta Sans, sans-serif',
          lineHeight: '22px',
          resize: 'none',
          padding: 0,
          cursor: isGenerating ? 'not-allowed' : 'text',
          transition: 'height 0.1s ease',
        }}
      />

      {/* Send button: inline (single) or bottom-right row (multi) */}
      {isMultiLine
        ? (
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginTop: '8px' }}>
            {ActionBtn}
          </div>
        )
        : ActionBtn
      }
    </div>
  )
})

export default AgentInputBar
