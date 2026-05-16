'use client'
import React from 'react'
import { C, font } from './constants'

const ThinkingStep = React.memo(
  function ThinkingStep({ step, isActive, liveDetail }) {
    const displayDetail = isActive ? liveDetail : step.detail
    return (
      <div style={{ paddingTop: '6px', marginTop: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: C.sub, fontFamily: font }}>
          <span style={{ fontWeight: 500 }}>{step.label}</span>
          {!step.isComplete
            ? <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: C.indigo, opacity: 0.7, animation: 'agentThinkPulse 1s infinite', marginLeft: 'auto', flexShrink: 0 }} />
            : <span style={{ marginLeft: 'auto', color: C.green, fontSize: '10px', flexShrink: 0 }}>✓</span>
          }
        </div>
        {displayDetail && (
          <div style={{
            marginTop: '4px', paddingLeft: '10px', borderLeft: `2px solid ${C.indigoBorder}`,
            fontSize: '11px', color: C.sub, lineHeight: 1.6, whiteSpace: 'pre-wrap', fontFamily: font,
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

export default function ThinkingBlock({ thinking, activeStepId, liveDetail, onToggle }) {
  if (!thinking || thinking.steps.length === 0) return null
  return (
    <div style={{ margin: '6px 0', fontSize: '12px' }}>
      <div onClick={onToggle} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer', userSelect: 'none' }}>
        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: C.muted, flexShrink: 0,
          ...(thinking.isComplete ? {} : { background: C.indigo, animation: 'agentThinkPulse 1s infinite' }) }} />
        <span style={{ color: C.muted, fontFamily: font }}>
          {thinking.isComplete
            ? `Thought for ${thinking.steps.length} step${thinking.steps.length !== 1 ? 's' : ''}`
            : 'Thinking...'
          }
        </span>
        <svg width="8" height="8" viewBox="0 0 10 10" fill="none" style={{ flexShrink: 0, transform: thinking.isOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>
          <path d="M3 2l4 3-4 3" stroke={C.muted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
      {thinking.isOpen && (
        <div style={{ marginTop: '6px', paddingLeft: '12px', borderLeft: `2px solid ${C.border}` }}>
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
