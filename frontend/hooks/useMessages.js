'use client'
import { useState, useEffect, useCallback } from 'react'

// ─── MOCK CHAT HISTORIES ──────────────────────────────────────────────────────
// TODO: delete this block when the real backend is wired.
// Real source: GET /api/contracts/:id/messages
// Returns the same shape: { role, text, time, metric?, id?, title?, detail?, actionType?, status?, approvedAt? }
const MOCK_CHATS = {
  c1: [
    { role: 'user',   text: 'I want to run a retargeting campaign for my summer sale. Target ROAS 2.0 with $500 minimum spend over 7 days.', time: 'May 9 · 9:02 AM' },
    { role: 'agent',  text: "I've analyzed your Meta account. Your 30-day website visitor audience shows strong purchase intent signals.\n\nI estimate a **61% chance** of achieving ROAS ≥ 2.0 within 7 days. My strategy: retargeting campaign targeting 30-day site visitors with value-oriented creative, optimizing for purchases at $75/day.\n\nMy success fee is **100 USDC**, locked in Arc escrow — you only pay if I hit your target.", time: 'May 9 · 9:02 AM' },
    { role: 'user',   text: "Let's go.", time: 'May 9 · 9:04 AM' },
    { role: 'system', text: 'Contract created · Escrow funded', time: 'May 9 · 9:05 AM' },
    { role: 'agent',  text: "Escrow confirmed — 100 USDC locked. Before I launch any ads, I'll walk you through each step. Your approval is required before any action executes.", time: 'May 9 · 9:05 AM' },
    { role: 'agent-action', id: 'c1-a1', title: 'Create retargeting campaign', detail: '30-day website visitors · Sales objective', actionType: 'campaign', status: 'approved', approvedAt: 'May 9 · 9:06 AM', time: 'May 9 · 9:06 AM' },
    { role: 'agent-action', id: 'c1-a2', title: 'Set daily budget — $75/day', detail: 'Purchase conversion optimization', actionType: 'budget', status: 'approved', approvedAt: 'May 9 · 9:07 AM', time: 'May 9 · 9:07 AM' },
    { role: 'agent-action', id: 'c1-a3', title: 'Launch 3 ad creatives', detail: 'Product benefit messaging · A/B split test', actionType: 'creative', status: 'approved', approvedAt: 'May 9 · 9:08 AM', time: 'May 9 · 9:08 AM' },
    { role: 'system', text: 'Campaign launched · 3 actions approved by merchant', time: 'May 9 · 9:09 AM' },
    { role: 'agent-update', text: 'Purchase volume is tracking well — keeping current budget split across 3 ad sets.', time: 'May 10 · 8:15 AM', metric: { roas: 1.22, day: 1 } },
    { role: 'agent-update', text: 'Ad set B is outperforming by 22%. Shifting 15% more budget there tomorrow.', time: 'May 11 · 8:30 AM', metric: { roas: 1.45, day: 2 } },
    { role: 'agent-update', text: 'Budget reallocation working — ad set B now drives 58% of conversions. On track.', time: 'May 12 · 8:10 AM', metric: { roas: 1.62, day: 3 } },
    { role: 'agent-update', text: 'Trending strong. Maximizing delivery over the final 3 days.', time: 'May 12 · 5:30 PM', metric: { roas: 1.74, day: 4 } },
    { role: 'agent',  text: "Day 4 wrapped. Ready to execute the key optimization — shifting budget toward the best-performing ad set for Days 5–7. Your approval is needed before I proceed.", time: 'May 12 · 5:31 PM' },
    { role: 'agent-action', id: 'c1-a4', title: 'Shift budget to best-performing ad set', detail: 'Move 40% from Ad Set A+C → Ad Set B · Day 5 optimization', actionType: 'budget', status: 'pending', time: 'May 12 · 5:31 PM' },
  ],
  c2: [
    { role: 'user',   text: 'Launching a new product next week. Target ROAS 1.8 with $300 minimum spend, 14 days.', time: 'May 11 · 2:00 PM' },
    { role: 'agent',  text: "New product launches are tricky without historical data — let me analyze your account.\n\nYour product category and average order value ($87) support a **1.8× target**. Similar launches average 1.6–2.4× within 14 days. I estimate **72% probability**.\n\nI'll start broad — testing 4 interest segments — then rapidly scale winners. My fee is **150 USDC**, locked in Arc escrow.\n\nFund the escrow and I'll launch within 2 hours.", time: 'May 11 · 2:01 PM' },
    { role: 'user',   text: "I'll fund it now.", time: 'May 11 · 2:03 PM' },
    { role: 'system', text: 'Contract created · Awaiting escrow funding', time: 'May 11 · 2:03 PM' },
  ],
  c3: [
    { role: 'user',         text: 'I need a brand awareness campaign for Q1. ROAS target 2.5× over 30 days, $1000 minimum spend.', time: 'Mar 29 · 10:00 AM' },
    { role: 'agent',        text: "30 days gives me enough room to properly optimize across multiple audience layers.\n\nI estimate **68% probability** of hitting ROAS ≥ 2.5×. Strategy: 1–3% lookalikes from your purchaser list + 14-day engaged visitor retargeting + dynamic product ads for cart abandoners.\n\nSuccess fee: **100 USDC** in Arc escrow.", time: 'Mar 29 · 10:01 AM' },
    { role: 'user',         text: "Let's do it.", time: 'Mar 29 · 10:02 AM' },
    { role: 'system',       text: 'Contract created · Escrow funded', time: 'Mar 29 · 10:05 AM' },
    { role: 'agent',        text: "Escrow confirmed. Here's my execution plan — I need approval for each step.", time: 'Mar 29 · 10:05 AM' },
    { role: 'agent-action', id: 'c3-a1', title: 'Launch 1–3% lookalike campaign', detail: 'Purchaser seed list · Cold audience', actionType: 'campaign', status: 'approved', approvedAt: 'Mar 29 · 10:06 AM', time: 'Mar 29 · 10:06 AM' },
    { role: 'agent-action', id: 'c3-a2', title: 'Retargeting — 14-day engaged visitors', detail: 'Warm audience · Dynamic product ads', actionType: 'audience', status: 'approved', approvedAt: 'Mar 29 · 10:07 AM', time: 'Mar 29 · 10:07 AM' },
    { role: 'agent-action', id: 'c3-a3', title: 'Dynamic product ads — cart abandoners', detail: 'High-intent audience · Catalog ads', actionType: 'creative', status: 'approved', approvedAt: 'Mar 29 · 10:08 AM', time: 'Mar 29 · 10:08 AM' },
    { role: 'system',       text: 'Campaign launched · 3 actions approved by merchant', time: 'Mar 29 · 10:09 AM' },
    { role: 'agent-update', text: 'Lookalike audience performing well. Cart abandoner DPAs hitting 3.2× on their own.', time: 'Apr 5 · 9:00 AM', metric: { roas: 1.80, day: 7 } },
    { role: 'agent-update', text: 'Reallocated 60% of budget to the top ad set. Cart DPAs now driving 40% of all conversions.', time: 'Apr 12 · 9:00 AM', metric: { roas: 2.18, day: 14 } },
    { role: 'agent-action', id: 'c3-a4', title: 'Reallocate 60% budget to top ad set', detail: 'Cart abandoner DPA → primary · Day 14 optimization', actionType: 'budget', status: 'approved', approvedAt: 'Apr 12 · 9:02 AM', time: 'Apr 12 · 9:01 AM' },
    { role: 'agent-update', text: 'Target already exceeded with a week remaining. Scaling to maximize the final result.', time: 'Apr 19 · 9:00 AM', metric: { roas: 2.56, day: 21 } },
    { role: 'agent-update', text: 'Campaign complete. Final ROAS: 2.73× against your 2.5× target. 100 USDC success fee released. Great run.', time: 'Apr 28 · 11:00 AM', metric: { roas: 2.73, day: 30 } },
    { role: 'system',       text: 'Contract settled · 100 USDC released to agent · Campaign closed', time: 'Apr 28 · 11:01 AM' },
  ],
  c4: [
    { role: 'user',         text: 'Flash sale this weekend. I need ROAS 3.0 in 3 days. Budget around $200.', time: 'Apr 29 · 8:00 AM' },
    { role: 'agent',        text: "ROAS 3.0 in 3 days is high risk — **41% probability**. The short window limits optimization cycles.\n\nI'd suggest lowering the target to 2.5× (68% probability) or extending to 7 days (61% at 3.0×). How do you want to proceed?", time: 'Apr 29 · 8:01 AM' },
    { role: 'user',         text: 'I understand the risk. Proceed with original terms.', time: 'Apr 29 · 8:02 AM' },
    { role: 'agent',        text: "Understood. Proceeding with ROAS ≥ 3.0 in 3 days at **41% probability**. I'll use flash sale countdown formats and target your highest-intent audiences from day one.\n\nSuccess fee: **80 USDC** in Arc escrow.", time: 'Apr 29 · 8:02 AM' },
    { role: 'system',       text: 'Contract created · Escrow funded', time: 'Apr 29 · 8:05 AM' },
    { role: 'agent',        text: "Escrow confirmed. Here's my plan for the 72-hour sprint — approval required for each step.", time: 'Apr 29 · 8:05 AM' },
    { role: 'agent-action', id: 'c4-a1', title: 'Flash sale campaign — countdown formats', detail: 'Previous purchasers + cart abandoners · Urgency creative', actionType: 'campaign', status: 'approved', approvedAt: 'Apr 29 · 8:06 AM', time: 'Apr 29 · 8:06 AM' },
    { role: 'agent-action', id: 'c4-a2', title: 'Maximize budget delivery — 72-hour window', detail: '$200 total · Accelerated delivery', actionType: 'budget', status: 'approved', approvedAt: 'Apr 29 · 8:07 AM', time: 'Apr 29 · 8:07 AM' },
    { role: 'system',       text: 'Campaign launched · 2 actions approved by merchant', time: 'Apr 29 · 8:08 AM' },
    { role: 'agent-update', text: 'Below trajectory for 3.0×. Shifted all budget to previous purchasers — your highest-intent segment.', time: 'Apr 30 · 8:00 AM', metric: { roas: 2.10, day: 1 } },
    { role: 'agent-update', text: "I've exhausted the highest-intent segments. The gap to 3.0× is unlikely to close in 24 hours.", time: 'May 1 · 8:00 AM', metric: { roas: 2.28, day: 2 } },
    { role: 'agent-update', text: 'Campaign ended. Target of 3.0× was not met. 80 USDC has been refunded to your wallet per the escrow contract.', time: 'May 2 · 12:00 PM', metric: { roas: 1.94, day: 3 } },
    { role: 'system',       text: 'Contract closed · 80 USDC refunded to wallet', time: 'May 2 · 12:01 PM' },
  ],
}

// ─── HOOK ─────────────────────────────────────────────────────────────────────
export function useMessages(contractId) {
  const [messages, setMessages]   = useState([])
  const [isThinking, setIsThinking] = useState(false)
  const [isConnected, setIsConnected] = useState(false)

  // Load history on contract change
  // TODO: replace with GET /api/contracts/:id/messages
  useEffect(() => {
    if (!contractId) return
    setMessages(MOCK_CHATS[contractId] || [])
    setIsConnected(true)

    // TODO: open SSE or WebSocket for live agent messages
    // const stream = new EventSource(`/api/contracts/${contractId}/stream`)
    // stream.onmessage = e => appendMessage(JSON.parse(e.data))
    // stream.onerror   = () => setIsConnected(false)
    // return () => stream.close()
  }, [contractId])

  const appendMessage = useCallback((msg) => {
    setMessages(prev => [...prev, msg])
  }, [])

  // Send a user message and await agent reply
  // TODO: replace stub with POST /api/contracts/:id/messages { text }
  //       then stream agent response chunks via SSE → appendMessage per chunk
  const sendMessage = useCallback((text) => {
    appendMessage({ role: 'user', text, time: 'Just now' })
    setIsThinking(true)

    setTimeout(() => {
      setIsThinking(false)
      appendMessage({
        role: 'agent',
        text: "Got it. I'm actively monitoring the campaign and will send you an update as soon as there's a meaningful change.",
        time: 'Just now',
      })
    }, 1400)
  }, [appendMessage])

  return {
    messages,
    isThinking,
    isConnected,
    sendMessage,
    appendMessage,  // exposed so other hooks (e.g. useActionApprovals) can inject messages
  }
}
