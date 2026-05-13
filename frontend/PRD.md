# OutcomeX — Frontend Sub-PRD
**Version 1.1 | Hackathon MVP**

---

## 1. Purpose

The frontend is the merchant-facing web application. It is the only surface the merchant interacts with. It must guide a merchant through the complete economic loop — creating a performance contract, reviewing the agent's decision, funding escrow, authorizing ad execution, monitoring live progress, and seeing the final settlement — clearly and without confusion.

The frontend does not contain business logic. It renders state from the backend and captures merchant intent.

---

## 2. Recommended Tech Stack

| Concern | Technology |
|---|---|
| Framework | Next.js (App Router) |
| Styling | Tailwind CSS + shadcn/ui |
| Charts | Lightweight charts (e.g. Recharts or Chart.js) |
| Authentication | Clerk (`@clerk/nextjs`) — email/Google sign-in, JWT issued per session |
| Wallet connection | Circle App Kit — drop-in components for USDC send, bridge, swap, and unified balance |
| Web3 / wallet fallback | wagmi + viem |
| State / data fetching | React Query or SWR |

**On Clerk:** Clerk handles email and Google sign-in out of the box. Wrap the app in `<ClerkProvider>` in `app/layout.tsx` and add `middleware.ts` to protect all `/contracts/*` routes. The Clerk JWT is sent as a `Bearer` token in every API request; the backend verifies it against `CLERK_SECRET_KEY`. Wallet connection (Circle App Kit) is a separate step that happens at the Escrow Funding screen — it is not login.

**On Circle App Kit:** The hackathon judges score Circle tool usage at 20%. App Kit provides drop-in components for the most common USDC flows (Bridge, Swap, Send, Unified Balance). Use these for the escrow funding step rather than building wallet connection from scratch.

---

## 3. The Demo Golden Path

The frontend must support this exact demo script end-to-end without any broken steps:

| Scene | What the screen shows |
|---|---|
| 1. Contract creation | Merchant fills in: ROAS >= 2.0, $500 min spend, 7 days, 100 USDC fee |
| 2. Underwriting | ML result: 68% success probability. Agent accepts. |
| 3. Escrow | Merchant funds 100 USDC into Arc escrow. Status → Funded. |
| 4. Strategy approval | Agent proposes retargeting plan. Merchant approves. Ads execute. |
| 5. Monitoring | Dashboard: $318 spent, ROAS 1.86, 3 days left, 61% success probability |
| 6. Resolution | Final: $545 spend, $1,226 revenue, ROAS 2.25 → success |
| 7. Settlement | 100 USDC released to agent. On-chain tx hash shown. |

**Final demo line the UI should support:** "The merchant paid nothing for advice. The agent earned only because it delivered the contracted marketing outcome."

---

## 4. Screens to Build

### 4.1 Landing Page
**Purpose:** Explain the OutcomeX model to first-time visitors.

**Must show:**
- Core value proposition: pay only when the agent delivers the contracted outcome
- How USDC escrow works in plain language
- Old model vs. OutcomeX model comparison
- Clear CTA: "Create a performance contract"

---

### 4.2 Contract Builder
**Purpose:** Capture the merchant's performance contract request.

**Must show / collect:**
- Product or campaign goal (free text description)
- Target metric — ROAS (only metric for MVP)
- Target threshold (e.g. >= 2.0)
- Minimum ad spend required before resolution is valid (e.g. $500)
- Evaluation time window in days (e.g. 7 days)
- Success fee in USDC (e.g. 100 USDC)
- Campaign mode: create new campaign or optimize existing campaign
- Ad account context (account ID or relevant account data)

**On submit:** calls `POST /api/contracts`, then immediately triggers underwriting and navigates to the Agent Evaluation screen.

---

### 4.3 Agent Evaluation Screen
**Purpose:** Show the agent's underwriting result and decision.

**Must show:**
- Estimated success probability (e.g. 68%)
- Risk level (low / medium / high)
- Expected ROAS range (e.g. 1.7 – 2.4)
- Agent decision: Accept, Counteroffer, or Reject
- Human-readable explanation from the LLM (e.g. "I estimate a 68% chance of achieving ROAS >= 2.0 within 7 days. I accept this contract.")
- If counteroffer: the revised terms proposed by the agent (revised target, revised fee, revised window)
- Merchant action: Accept the agent's offer or decline

**Counteroffer example to render:**
> "ROAS >= 3.0 is too aggressive. I propose ROAS >= 2.0 for 100 USDC or ROAS >= 3.0 with a 14-day window and a higher fee."

---

### 4.4 Escrow Funding Screen
**Purpose:** Confirm final terms and lock USDC into Arc escrow.

**Must show before the merchant can fund:**
- Final agreed contract terms (target, spend floor, deadline, success fee)
- Refund logic explained: "If the target is not met, your USDC is returned."
- USDC amount to be escrowed
- Merchant wallet connection status

**Must show after funding:**
- Escrow confirmation
- On-chain transaction hash
- Contract status: Funded

**Safety rule:** The merchant must be able to see all terms (target, spend floor, deadline, fee, refund logic) before the fund button is active.

---

### 4.5 Strategy Approval Screen
**Purpose:** Show the agent's proposed Meta Ads strategy and get explicit merchant authorization before any ads run.

**Must show:**
- Strategy summary in plain language (e.g. "Launch a retargeting campaign focused on warm audiences with a value-oriented product angle.")
- Structured list of planned ad actions:
  - Create campaign (objective: sales)
  - Create ad set (audience: 30-day website visitors)
  - Set daily budget ($75/day)
- Rationale for the approach
- Approve button (execution does not happen until this is clicked)
- Option to decline or request a revised strategy

**Safety rule:** No ad action executes without the merchant clicking Approve on this screen.

---

### 4.6 Live Monitoring Dashboard
**Purpose:** Show real-time campaign progress while the contract is active.

**Must show:**
- Current spend vs. minimum spend threshold (e.g. $318 / $500)
- Current revenue
- Current ROAS vs. target ROAS (e.g. 1.86 vs. 2.0 target)
- Days remaining in evaluation window (e.g. 3 days left)
- ML-estimated probability of success (e.g. 61%)
- Contract status indicator (Active / On Track / At Risk)

**Data refreshes** periodically from `GET /api/contracts/:id/performance`.

---

### 4.7 Resolution & Settlement Screen
**Purpose:** Close the contract loop and prove what happened.

**Must show:**
- Final metrics: total spend, total revenue, final ROAS
- Outcome verdict: Success or Failure
- Settlement action:
  - Success → "100 USDC released to agent wallet. [tx hash]"
  - Failure → "100 USDC refunded to merchant wallet. [tx hash]"
- On-chain transaction proof (transaction hash, linkable to block explorer)

---

## 5. Contract Status State Machine

The frontend must reflect these contract states visually:

```
Created → Funded → Active → Resolved (Success | Failure) → Settled
```

Each screen maps to a state. Navigation should follow this sequence and not allow skipping steps.

---

## 6. Safety & Trust Rules

- The merchant must explicitly approve before any of these actions happen: funding escrow, authorizing ad execution.
- The fund escrow button must not be active until the merchant has seen all contract terms.
- The approve execution button must not be active until the strategy plan is displayed.
- Settlement outcome is shown as deterministic fact, not an AI opinion.
- On-chain transaction hashes must be shown as proof for any fund movement.

---

## 6a. Security Rules (Frontend)

### Never Render LLM Output as Raw HTML

Agent-generated text appears in the conversation timeline. Rendering it with `dangerouslySetInnerHTML` opens a stored XSS vector — a manipulated LLM output could execute arbitrary JavaScript in the merchant's browser.

```tsx
// WRONG — executes any script tag in LLM output
<div dangerouslySetInnerHTML={{ __html: message.content }} />

// CORRECT — render as sanitized markdown or plain text only
import ReactMarkdown from 'react-markdown';

<ReactMarkdown
  components={{
    // Force external links to open safely
    a: ({ href, children }) => (
      <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
    ),
    // Disallow raw HTML in markdown source
    html: () => null,
  }}
>
  {message.content}
</ReactMarkdown>
```

### Approval Gates Are UX Only — Server Side is the Real Enforcement

The disabled Approve button is a UX convenience. A determined attacker bypasses the frontend entirely and calls the API directly. Never rely on frontend gating for security. The backend state gate (checking `strategy_plans.approval_status` in the DB) is the actual enforcement.

This means: if the backend state gate is missing, the frontend gate is worthless. Both must exist, and the backend gate is the one that matters.

### USDC Amounts Must Display Exactly What Gets Sent

Never truncate, round, or abbreviate USDC amounts shown before the merchant confirms a transaction. What the merchant reads must be the exact value passed to `fund()`.

```tsx
// WRONG — rounds 100.5 to "100 USDC", merchant funds more than shown
<span>{Math.floor(contract.success_fee_usdc)} USDC</span>

// CORRECT — display full precision, no rounding
<span>{contract.success_fee_usdc.toFixed(2)} USDC</span>
```

### Validate Transaction Hashes Before Constructing Explorer URLs

Arc tx hashes from the API must be validated before being embedded in links. An invalid or malicious hash value could produce a broken or misleading URL.

```typescript
const TX_HASH_REGEX = /^0x[a-fA-F0-9]{64}$/;

function TxHashLink({ hash }: { hash: string }) {
  if (!TX_HASH_REGEX.test(hash)) {
    return <span className="text-muted">{hash}</span>;  // show but don't link
  }
  return (
    <a
      href={`${ARC_EXPLORER_URL}/tx/${hash}`}
      target="_blank"
      rel="noopener noreferrer"
    >
      {hash.slice(0, 10)}...{hash.slice(-6)}
    </a>
  );
}
```

### Let Clerk Manage the Session Token — Never Touch localStorage

Clerk stores the JWT in a secure, httpOnly cookie automatically. Do not manually read, write, or copy the session token into `localStorage` or React state. Use `getToken()` from `useAuth()` when you need to attach it to an API request.

```typescript
// WRONG — copies JWT to localStorage, readable by any XSS script
const { getToken } = useAuth();
localStorage.setItem('auth_token', await getToken());

// CORRECT — read token only when you need to send a request; never store it
const { getToken } = useAuth();
const res = await fetch('/api/contracts', {
  headers: { Authorization: `Bearer ${await getToken()}` },
});
```

Wallet connection (Circle App Kit) happens at the Escrow Funding step and is separate from Clerk session auth.

---

## 7. MVP Acceptance Criteria (Frontend)

- [ ] Merchant can fill in and submit a performance contract.
- [ ] Agent underwriting result (probability, risk, decision, explanation) is displayed.
- [ ] Counteroffer terms are rendered when the agent counteroffers.
- [ ] Merchant can fund USDC escrow; confirmation and tx hash are shown.
- [ ] Strategy plan is displayed with an approve button before execution.
- [ ] Live monitoring dashboard shows spend, ROAS, probability, and time remaining.
- [ ] Resolution screen shows final metrics, outcome verdict, and settlement proof.
- [ ] The full demo golden path (Scenes 1–7) runs without broken steps.

---

## 8. Non-Goals for MVP

- Complex wallet management or fiat on/off-ramp UI
- Creative asset upload or ad creative generation
- Multi-contract management views
- User account settings or profile management
- Mobile-optimized layout (desktop demo is sufficient)

---

## 9. Stretch Goals (Frontend)

| Goal | What to build |
|---|---|
| Dynamic fee display | Show the agent's fee recommendation adjusting in real time as the merchant changes target difficulty |
| Mid-flight adjustment notification | Alert the merchant if the agent is shifting budget or strategy mid-contract |
| CPA + ROAS dual target | Extend contract builder and monitoring dashboard to support a second metric |

---

## 10. Judging Context

The frontend is the demo surface. Judges see this first.

| Judging criterion | Weight | How frontend contributes |
|---|---|---|
| Agentic Sophistication | 30% | The UI must make agent decision-making visible — probability scores, counteroffer reasoning, live forecast — so judges can see the agent is actually deciding, not just automating |
| Traction | 30% | Real users must be able to complete the flow during May 11–25. The UI must be live, accessible, and usable without a guided walkthrough |
| Circle tool usage | 20% | App Kit components for USDC escrow funding; Arc tx hashes displayed as links to the Arc block explorer |
| Innovation | 20% | The escrow + agent + settlement loop is novel; make sure the landing page communicates the "pay only on outcomes" model clearly |

**Traction note:** The hackathon ends May 25. The frontend needs to be deployed and accessible to real merchants, not just runnable locally. Plan for a real deployment (Vercel or equivalent) from the start.

---

## 11. Dependencies

| Needs from | What |
|---|---|
| `backend/` | All API endpoints listed in Section 14 of the main PRD |
| `agent/` | Underwriting result, LLM offer text, strategy plan, live forecast — all surfaced via backend API |
| `contracts/` | Escrow tx hash and settlement tx hash for display; Arc block explorer URL for linking |
| Circle App Kit | Drop-in USDC send component for the escrow funding screen |
