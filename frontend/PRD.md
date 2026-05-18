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
| 1. Contract creation | Brand fills in: ROAS >= 2.0, $500 min spend, 7 days, 100 USDC fee (Meta Ads account pre-connected via sidebar — not entered in form) |
| 2. Underwriting | ML result: 68% success probability. Agent accepts. |
| 3. Escrow | Brand funds 100 USDC into Arc escrow. Status → Funded. |
| 4. Strategy approval | Agent pulls live campaign data via MCP, proposes 4 action cards (campaign · audience · budget · creative), each grounded in real account data. Brand approves each card. Ads execute. |
| 5. Monitoring | Dashboard: $318 spent, ROAS 1.86, 3 days left, 61% success probability |
| 6. Resolution | Final: $545 spend, $1,226 revenue, ROAS 2.25 → success |
| 7. Settlement | 100 USDC released to agent. On-chain tx hash shown. |

**Final demo line the UI should support:** "The brand paid nothing for advice. The agent earned only because it delivered the contracted marketing outcome."

---

## 4. Screens to Build

### Architecture note: Unified Workspace

Screens 4.3–4.7 are all rendered inside a single **Workspace** route (`/contracts/[id]/workspace`) rather than as separate pages. The workspace has two persistent panels:

- **Left panel:** ordered chat timeline — agent bubbles, merchant bubbles, daily update cards, approval cards, system banners. Layout is the same across all lifecycle phases.
- **Right panel:** adapts based on `contract.status` — live ROAS metrics during `Active`, the escrow fund button during `Funded-pending`, final outcome during `Resolved`/`Settled`.

The sections below (4.3–4.7) describe what content must appear at each phase, not separate route pages.

---

### 4.0 Authentication Screens

**Purpose:** Gate access to the app. Unauthenticated users are redirected to Clerk's hosted sign-in/sign-up UI; on success they land on `/dashboard`.

**What the merchant sees:**
- Clerk-hosted sign-in page (email / Google OAuth) — no custom auth UI needed
- Clerk-hosted sign-up page (email / Google OAuth)

**Required wiring (not yet done as of v1.1):**
- Wrap `app/layout.tsx` in `<ClerkProvider>`
- Add `middleware.ts` to protect `/contracts/*`, `/dashboard`, `/settings`
- After sign-in, redirect to `/dashboard`
- Use `useAuth().getToken()` inline on every API request — never write the JWT to `localStorage`

---

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

**Meta Ads account:** The merchant's connected Meta Ads account ID is read from their profile (set via the Settings sidebar selector). It is **not** entered in the contract builder form. If no account is connected, show a prompt to connect one in Settings before the form can be submitted.

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
**Purpose:** Show the agent's proposed Meta Ads strategy as individual action cards and get explicit per-action merchant authorization before any ads run.

**Must show:**
- Strategy summary in plain language (e.g. "Launch a retargeting campaign focused on warm audiences — your warm 30d audience has 2.1x ROAS.")
- **Four individual `approval_request` cards**, one per action type, each rendered independently:
  - **Campaign card** — campaign objective, name, placement (e.g. "Create sales campaign targeting warm audiences")
  - **Audience card** — targeting spec, audience size, lookalike % (e.g. "30-day website visitors + 1% lookalike")
  - **Budget card** — daily budget, bid strategy (e.g. "$75/day · lowest-cost bidding")
  - **Creative card** — ad copy, image, CTA (e.g. "Summer sale creative · Shop Now CTA")
- Each card shows: title, detail, estimated daily spend, expected ROAS impact
- Each card has independent **Approve** / **Decline** buttons
- A summary banner shows how many cards are approved vs. pending

**Execution rule:** Execution begins only after all four cards are approved. Declining one card skips that action; the remaining approved actions still execute.

**Safety rule:** No ad action executes without the merchant explicitly approving its card. This applies in both manual and auto-approve modes for the initial strategy.

---

### 4.6 Live Monitoring Dashboard
**Purpose:** Show real-time campaign progress and surface agent-suggested actions while the contract is active.

**Must show:**
- Current spend vs. minimum spend threshold (e.g. $318 / $500)
- Current revenue
- Current ROAS vs. target ROAS (e.g. 1.86 vs. 2.0 target)
- Days remaining in evaluation window (e.g. 3 days left)
- ML-estimated probability of success (e.g. 61%)
- Contract status indicator (Active / On Track / At Risk)

**Daily monitoring tick UI (in the chat timeline):**
- Each 24h tick appends a `daily_update` card to the timeline — shows real ROAS, spend, days left, and ML forecast.
- In **manual mode**: the tick also appends `approval_request` cards for each suggested optimization. Each card shows the action, rationale, and a countdown to `expires_at` (23h window). The merchant clicks **Approve** or **Decline** per card. Unanswered cards show as expired at the next tick.
- In **auto mode**: the tick appends a `system_event` per action executed (e.g. "Budget scaled · warm_30d $50 → $65/day"). No approval cards.
- Urgency styling: `recommended` (standard), `urgent` (amber highlight), `critical` (red, pinned to top).
- A badge on the workspace header shows the count of pending approval cards when in manual mode.

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

### 4.8 Agent Thinking Indicator

**Purpose:** Show the merchant that the agent is processing so the UI does not appear frozen.

**When it appears:** In the chat timeline immediately after the merchant sends a message, while the streaming response has not yet started. Disappears as soon as the first token arrives.

**What it looks like:** Three animated dots next to the agent avatar icon — the same row position as an agent chat bubble but with a bouncing-dot animation instead of text.

**Rule:** This is a transient loading state only. It is never persisted to the DB and never appears in history loaded from `GET /messages`.

---

### 4.9 Settings Screen

**Route:** `/settings`

**Purpose:** Let merchants configure how the agent behaves and review connected accounts.

**Must show:**

**Agent Execution — Approval Mode**
- **Manual (default):** Each 24h monitoring tick surfaces `approval_request` cards in the chat timeline — one per suggested action (scale budget, pause ad_set, swap creative, etc.). Merchant must click Approve per card before the action runs. Cards expire after 23h; unanswered cards are skipped at the next tick.
- **Auto-approve:** The agent executes all monitoring tick decisions immediately via Meta Ads MCP. Actions are logged as `system_event` cards in the timeline. No approval cards for monitoring decisions.
- **The initial strategy plan always requires explicit approval in both modes.** Auto mode only applies to mid-campaign monitoring adjustments.
- An amber banner appears at the top of the Workspace when a contract is Active and approval mode is Manual, showing the count of pending approval cards and linking to Settings.
- Preference is saved to the user's profile on the backend (not just browser-local) so it persists across devices.

**Connected Accounts**
- Meta Ads account: shows account ID and connection status
- Wallet: shows connected wallet address and status (populated after Escrow Funding step)

**Notifications** (toggles)
- Daily agent progress updates
- Approval request alerts
- Contract settlement alerts

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

- [ ] Clerk authentication gates all `/contracts/*`, `/dashboard`, and `/settings` routes. Unauthenticated users are redirected to sign-in.
- [ ] Merchant can fill in and submit a performance contract.
- [ ] Agent underwriting result (probability, risk, decision, explanation) is displayed.
- [ ] Counteroffer terms are rendered when the agent counteroffers.
- [ ] Agent thinking indicator (animated dots) appears while awaiting a streaming response.
- [ ] Merchant can fund USDC escrow; confirmation and tx hash are shown.
- [ ] Strategy plan is displayed with an approve button before execution.
- [ ] Live monitoring dashboard shows spend, ROAS, probability, and time remaining.
- [ ] Resolution screen shows final metrics, outcome verdict, and settlement proof.
- [ ] Settings screen lets the merchant toggle manual vs. auto-approve mode.
- [ ] Manual-approval banner appears in the Workspace header when a contract is Active.
- [ ] The full demo golden path (Scenes 1–7) runs without broken steps.

---

## 8. Non-Goals for MVP

- Complex wallet management or fiat on/off-ramp UI
- Creative asset upload or ad creative generation
- Multi-contract management views
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
| `backend/` | All 14 API endpoints documented in `backend/PRD.md` Section 4; full endpoint shapes in Section 12 of this PRD |
| `agent/` | Underwriting result, LLM offer text, strategy plan, live forecast — all surfaced via backend API |
| `contracts/` | Escrow tx hash and settlement tx hash for display; Arc block explorer URL for linking |
| Circle App Kit | Drop-in USDC send component for the escrow funding screen |

---

## 12. API Contract Reference

The frontend consumes these 14 backend endpoints. All requests include `Authorization: Bearer <clerk-token>`. Base URL is `NEXT_PUBLIC_API_URL`.

### Contract Lifecycle Endpoints

| Method | Endpoint | Called from screen | Notes |
|---|---|---|---|
| POST | `/api/contracts` | Contract Builder | Create contract; navigate to evaluation on 201 |
| POST | `/api/contracts/:id/underwrite` | Agent Evaluation | Trigger ML model; poll or subscribe via SSE for result |
| POST | `/api/contracts/:id/agent-offer` | Agent Evaluation | Request LLM offer; result arrives via SSE |
| POST | `/api/contracts/:id/accept` | Agent Evaluation | Merchant accepts offer |
| POST | `/api/contracts/:id/fund-escrow` | Escrow Funding | Confirm Arc tx; status → Funded |
| POST | `/api/contracts/:id/generate-strategy` | Strategy Approval | Request strategy plan |
| POST | `/api/contracts/:id/approve-execution` | Strategy Approval | Merchant approves; status → Active |
| POST | `/api/contracts/:id/execute-ads-actions` | Strategy Approval | Called immediately after approval; fire-and-forget from frontend |
| GET | `/api/contracts/:id/performance` | Live Monitoring | Poll every 30 s |
| POST | `/api/contracts/:id/resolve` | Resolution | Trigger deterministic settlement |

### Message and Streaming Endpoints

| Method | Endpoint | Called from screen | Notes |
|---|---|---|---|
| GET | `/api/contracts/:id/messages` | All contract screens | Step 1 of two-step hydration on mount |
| POST | `/api/contracts/:id/messages` | Workspace chat | Persist merchant message before streaming |
| POST | `/api/contracts/:id/chat/stream` | Workspace chat | Step 2 for chat — streams `data: {"text":"..."}` lines |
| GET | `/api/contracts/:id/events` | All contract screens | Step 2 of two-step hydration — SSE for live updates |

### Request / Response Shapes

**POST `/api/contracts`**
```typescript
// Request
{
  campaign_goal: string;           // free text product/campaign description
  target_metric: "ROAS";           // only supported metric for MVP
  threshold: number;               // e.g. 2.0
  minimum_spend: number;           // e.g. 500
  time_window_days: number;        // e.g. 7
  success_fee_usdc: number;        // e.g. 100
  campaign_mode: "new" | "optimize";
  account_context: Record<string, unknown>;  // ad account ID + metadata
}
// Response 201
{ id: string; status: "Created"; created_at: string; }
```

**GET `/api/contracts/:id/performance`**
```typescript
// Response 200
{
  spend: number;
  revenue: number;
  roas: number | null;             // null if spend === 0
  success_probability: number;     // 0–1
  days_remaining: number;
  contract_status: "Active" | "On Track" | "At Risk";
}
```

**POST `/api/contracts/:id/fund-escrow`**
```typescript
// Request — sent after Circle App Kit confirms the on-chain tx
{ tx_hash: string; amount_usdc: number; }
// Response 200
{ status: "Funded"; escrow_tx_hash: string; funded_at: string; }
```

**POST `/api/contracts/:id/resolve`**
```typescript
// Response 200
{
  final_spend: number;
  final_revenue: number;
  final_roas: number;
  outcome: "success" | "failure";
  settlement_tx_hash: string;
}
```

**GET `/api/contracts/:id/events`** — SSE stream
Each event is a `ContractMessage` JSON object (see Section 13). Named events:
- `message` — agent or merchant chat bubble
- `daily_update` — agent day-N ROAS card
- `approval_request` — strategy or terms approval card
- `system_event` — lifecycle banner (e.g. "Escrow funded")

**POST `/api/contracts/:id/chat/stream`** — SSE stream
```
data: {"text": "I estimate a "}
data: {"text": "68% chance..."}
data: [DONE]
```

**POST `/api/users/me/wallet`**
```typescript
// Request — sent after Circle App Kit wallet connection
{ wallet_address: string; signature: string; }
// Response 200
{ wallet_address: string; }
```

---

## 13. TypeScript Types

Define these in `lib/types.ts`. They must match the backend Pydantic schemas exactly.

```typescript
// Core message type — every row from GET /messages renders by this shape
export interface ContractMessage {
  id: string;
  contract_id: string;
  role: 'agent' | 'merchant' | 'system';
  type: 'message' | 'daily_update' | 'approval_request' | 'system_event';
  content: string;
  metadata: Record<string, unknown>;
  status: 'pending' | 'approved' | 'declined' | 'expired' | null;
  expires_at: string | null;   // ISO timestamp — set on monitoring-tick approval cards; null for initial strategy cards
  created_at: string;
}

// Metadata shape for approval_request messages (in ContractMessage.metadata)
export interface ApprovalCardMetadata {
  plan_id: string;
  action_type: 'campaign' | 'audience' | 'budget' | 'creative'
    | 'budget_adjustment' | 'pause_ad_set' | 'resume_ad_set' | 'swap_creative';
  title: string;
  detail: string;
  estimated_daily_spend?: number;
  expected_roas?: number;
  urgency?: 'recommended' | 'urgent' | 'critical';  // monitoring tick cards only
}

// Full contract record from GET /contracts/:id
export interface PerformanceContract {
  id: string;
  merchant_id: string;
  target_metric: string;
  threshold: number;
  minimum_spend: number;
  time_window_days: number;
  success_fee_usdc: number;
  campaign_mode: 'new' | 'optimize';
  campaign_goal: string;
  account_context: Record<string, unknown>;
  status: 'Created' | 'Funded' | 'Active' | 'Resolved' | 'Settled';
  created_at: string;
  funded_at: string | null;
  resolved_at: string | null;
}

// From POST /underwrite result surfaced via contract messages metadata
export interface UnderwritingResult {
  success_probability: number;        // 0–1
  risk_level: 'low' | 'medium' | 'high';
  expected_roas_range: [number, number];
  recommendation: 'accept' | 'counteroffer' | 'reject';
  recommended_fee_usdc: number;
}

// From POST /agent-offer result surfaced via contract messages metadata
export interface AgentOffer {
  offer_type: 'accept' | 'counteroffer' | 'reject';
  message: string;
  revised_threshold?: number;
  revised_fee_usdc?: number;
  revised_time_window_days?: number;
}

// From GET /performance
export interface PerformanceSnapshot {
  spend: number;
  revenue: number;
  roas: number | null;
  success_probability: number;
  days_remaining: number;
  contract_status: string;
}

// From POST /resolve
export interface ResolutionResult {
  final_spend: number;
  final_revenue: number;
  final_roas: number;
  outcome: 'success' | 'failure';
  settlement_tx_hash: string;
}

// Strategy plan surfaced via approval_request message metadata
export interface StrategyPlan {
  id: string;
  summary: string;
  planned_actions: Array<{
    type: string;         // e.g. "create_campaign"
    description: string;  // human-readable
    params: Record<string, unknown>;
  }>;
  approval_status: 'pending' | 'approved' | 'declined';
}
```

---

## 14. Environment Variables

Set in `.env.local` for local development. Set as encrypted secrets in Vercel for production.

| Variable | Description | Where to get it |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | Deployed backend service URL | Railway/Render dashboard after backend deploy |
| `NEXT_PUBLIC_ARC_EXPLORER_URL` | Arc block explorer base URL for tx hash links | Arc developer docs |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk publishable key — safe to expose in browser | Clerk dashboard → API Keys |
| `CLERK_SECRET_KEY` | Clerk secret key — Next.js server-side only, never sent to browser | Clerk dashboard → API Keys |

For local dev, point `NEXT_PUBLIC_API_URL` to `http://localhost:8000` while the backend runs locally.

---

## 15. Engineering Principles

Full implementation patterns are documented in [README.md](README.md). Key rules:

1. **UI reads from DB, never calls the agent directly.** The agent writes to DB. The frontend reads backend API. No direct agent communication.
2. **Screen = contract state.** Routing follows the state machine in Section 5. No skipping steps. Contract state drives navigation, not URL history.
3. **Two-step hydration on every contract screen mount.** `GET /messages` first (full history), then open SSE `/events` stream. Never open the stream before the hydration completes.
4. **Render the timeline by `message.type`.** `system_event` → banner; `message` → chat bubble; `daily_update` → metrics card; `approval_request` → approval card with `message.status`.
5. **LLM streaming via `fetch` + `ReadableStream`.** Not `EventSource` (GET-only). The chat endpoint is a POST stream. See README.md Principle 6 for the implementation pattern.
6. **Chat is Q&A only.** The chat input never triggers ad execution. Strategy changes go through an `approval_request` card in the timeline.
7. **Never render LLM output as raw HTML.** Use `ReactMarkdown` with `html: () => null`. See Section 6a.
8. **Make agent intelligence visible.** Every screen that shows the agent's reasoning must display: success probability (with source label), the agent's plain-language rationale, and live ROAS vs. target trajectory. See README.md for the full principle.
