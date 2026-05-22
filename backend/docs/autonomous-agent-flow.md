# Autonomous Agent Flow — Full System Reference

All use cases, lifecycle states, and data flows for the Bidtopus autonomous agent.

---

## 1. Architecture Overview

```mermaid
graph TD
    User(["👤 Merchant"])
    FE["Frontend\n(SSE consumer)"]
    BE["Backend\nConductor\nPOST /api/contracts/:id/conductor/stream"]
    AG["Agent Service\n(HTTP capability endpoints)"]
    DB[("PostgreSQL\n(Neon)")]
    MCP["Meta Ads MCP\nmcp.facebook.com/ads\nor mcp.pipeboard.co/meta-ads-mcp\n(MCP protocol over HTTP)"]
    ARC["Arc Escrow\n(on-chain USDC lock/release/refund)"]
    CIRCLE["Circle Wallets\n(agent receiving wallet, HSM-backed)"]
    PAY["Arc Paymaster\n(gas in USDC — no native token)"]
    KIT["Circle App Kit\n(drop-in browser wallet)"]

    User -->|"sends message"| FE
    FE -->|"SSE request\n(Clerk JWT)"| BE
    BE -->|"reads / advances state"| DB
    BE -->|"Claude tool calls\n(X-Service-Token)"| AG
    AG -->|"MCP tool calls\n(get_insights / create_campaign / update_adset)"| MCP
    AG -->|"release() or refund() + tx_hash"| ARC
    ARC -->|"USDC to agent"| CIRCLE
    PAY -->|"sponsors gas for fund/release/refund"| ARC
    KIT -->|"merchant funds escrow\n(browser wallet)"| ARC
    BE -->|"SSE events stream"| FE
    FE -->|"renders steps + approvals live"| User
```

> **Meta Ads MCP vs Marketing API:** The agent does NOT call Meta's Marketing REST API directly.
> It connects to the MCP server via `streamablehttp_client` using `ClientSession.call_tool()` —
> the same MCP transport Claude Code uses. The `MockMetaAdsAdapter` returns deterministic fake
> data when `META_ADS_MOCK=True` and makes no external connection.

---

## 2. Full Contract Lifecycle

Nine states, five autonomous decisions, three actor types.

```mermaid
stateDiagram-v2
    [*] --> Negotiating : Merchant submits contract goal\n(Meta Ads account pre-connected in Settings)

    Negotiating --> Created : Claude agrees terms\n(LLM with extended thinking\n→ evaluate_contract_terms + finalize_contract tools)

    Created --> Underwriting : ML underwrites risk\n(9 features: hist_roas_7d/30d, avg_daily_spend,\ntarget_roas, min_spend, time_window, campaign_type, aov, roas_gap\n→ success_probability, risk_level, fee_usdc)

    Underwriting --> Offered : LLM generates offer\n(accept / counteroffer / reject\n+ plain-language explanation streamed to merchant)

    Offered --> FundedPending : Merchant accepts offer\n(Circle App Kit browser wallet)
    Offered --> [*] : Merchant declines

    FundedPending --> Funded : Arc Escrow confirms USDC locked\n(fund tx_hash verified on-chain\n— Paymaster covers gas in USDC)

    Funded --> Active : LLM generates 4 action cards via MCP\n(campaign · audience · budget · creative)\nMerchant approves each → execute-ads-actions\n→ campaign_id + ad_set_ids stored in execution_receipts

    Active --> Active : ML + LLM monitoring tick every 24h\nExpire stale cards → MCP get_adset_insights → ML forecast\nManual: approval cards (expires_at = now + 23h)\nAuto: immediate MCP execution

    Active --> Settled : After time window closes\nDeterministic engine: spend ≥ min AND roas ≥ target\nSuccess → Arc release() + Circle Wallets receives USDC\nFailure → Arc refund() to merchant

    Settled --> [*]
```

---

## 3. The Five Autonomous Decisions

```mermaid
flowchart TD
    D1["Decision 1 — ML Underwrites\nEvaluates 9 features\n→ success_probability: 0.68\n→ risk_level: medium\n→ accept / counteroffer / reject"]

    D2["Decision 2 — LLM Negotiates\nClaude with extended thinking (5k tokens)\nReasoning streamed live as thinking steps\n→ offer_type + message + revised terms"]

    D3["Decision 3 — LLM Strategizes\nMCP reads real account data first:\ncampaigns · pixel events · audience ROAS · creatives\nBuilds data-driven plan (8k thinking tokens)\n→ 4 approval_request cards (campaign · audience · budget · creative)\nMerchant approves each card independently"]

    D4["Decision 4 — ML + LLM Optimize Live (every 24h)\nMCP get_adset_insights → real ad-set-level ROAS\nML forecast: predicted_final_roas, success_probability, status\nLLM: which ad_sets to scale / pause / swap\nManual: approval cards with urgency levels\nAuto: execute immediately via MCP"]

    D5["Decision 5 — Engine Settles (deterministic)\nPure logic — no LLM, no ML\nROAS 2.25x ≥ 2.0x ✓  Spend $545 ≥ $500 ✓\n→ release USDC to agent OR refund to merchant\n→ settlement tx_hash on Arc"]

    D1 --> D2 --> D3 --> D4 --> D5

    style D5 fill:#d4edda,stroke:#28a745
```

> **The LLM never makes the settlement call.** Resolution is deterministic `roas >= target AND spend >= minimum` — auditable and tamper-proof. The LLM narrates the result; the math decides it.

---

## 4. Step-by-Step Conductor Flow

The unified `POST /api/contracts/:id/conductor/stream` endpoint. Claude decides which capability to call based on contract state and the merchant's message.

```mermaid
sequenceDiagram
    actor M as Merchant
    participant FE as Frontend
    participant C as Conductor (Backend Claude)
    participant DB as PostgreSQL
    participant AG as Agent Service
    participant MCP as Meta Ads MCP Server

    M->>FE: sends message
    FE->>C: POST /api/contracts/:id/conductor/stream (Clerk JWT)

    Note over C: Claude starts extended thinking

    C-->>FE: SSE thinking_step_start "Agent reasoning..."
    C-->>FE: SSE thinking_step_detail (live stream)

    C->>DB: tool: check_contract_state
    DB-->>C: { status, terms, performance, messages... }

    C-->>FE: SSE thinking_step_end ✓

    alt General question (no agent call needed)
        C-->>FE: SSE text (streams answer directly from DB state)

    else ML underwriting needed (status = Created)
        C-->>FE: SSE thinking_step_start "Running ML underwriting model..."
        C->>AG: POST /agent/underwrite
        AG-->>C: { probability, risk_level, expected_roas_range, recommended_fee }
        C-->>FE: SSE thinking_step_detail (ML results)
        C-->>FE: SSE thinking_step_end ✓
        C-->>FE: SSE text (streams probability + recommendation)

    else LLM offer generation needed (status = Underwriting)
        C-->>FE: SSE thinking_step_start "Generating agent offer..."
        C->>AG: POST /agent/agent-offer
        AG-->>C: { offer_type, message, revised_threshold, revised_fee, revised_window }
        C-->>FE: SSE thinking_step_detail (offer details)
        C-->>FE: SSE thinking_step_end ✓
        C-->>FE: SSE text (streams offer explanation)

    else Strategy generation needed (status = Funded)
        C-->>FE: SSE thinking_step_start "Reading your Meta Ads account data..."
        C-->>FE: SSE thinking_step_start "Generating Meta Ads campaign plan..."
        C->>AG: POST /agent/generate-plan
        AG-->>MCP: get_campaigns + get_insights + get_adsets + get_ad_creatives
        MCP-->>AG: real account data (campaigns, audiences, creatives)
        AG-->>C: { summary, actions[], estimated_spend }
        C-->>FE: SSE thinking_step_detail (plan summary)
        C-->>FE: SSE thinking_step_end ✓

        Note over C: Writes 4 approval_request cards to DB

        alt approval_mode = manual (default)
            C-->>FE: SSE approval_required (campaign card)
            C-->>FE: SSE approval_required (audience card)
            C-->>FE: SSE approval_required (budget card)
            C-->>FE: SSE approval_required (creative card)
            M->>FE: clicks Approve / Decline on each card independently
            FE->>DB: PATCH /actions/:id/approve or /decline
            C->>DB: tool: poll_approval_status (5s interval)
            DB-->>C: { all_approved: true }
        else approval_mode = auto
            Note over C: tool returns approved immediately
        end

        C-->>FE: SSE thinking_step_start "Executing ad campaign actions..."
        C->>AG: POST /agent/execute-ads-actions
        AG-->>MCP: create_campaign → create_adset → create_ad_creative → create_ad
        MCP-->>AG: campaign_id + ad_set_ids + creative_ids
        AG-->>C: { actions_executed[], execution_receipts, summary }
        C-->>FE: SSE thinking_step_detail (actions run + IDs)
        C-->>FE: SSE thinking_step_end ✓
        C-->>FE: SSE text (streams launch summary)

    else Performance check (status = Active)
        C-->>FE: SSE thinking_step_start "Checking campaign performance..."
        C->>AG: GET /agent/performance
        AG-->>MCP: get_adset_insights (scoped to execution_receipts ad_set_ids)
        MCP-->>AG: { spend, revenue, roas, ctr, conversions }
        AG-->>C: snapshot + ML live forecast { predicted_final_roas, success_probability, status }
        C-->>FE: SSE thinking_step_detail (ROAS, spend, day N of M, on_track/at_risk)
        C-->>FE: SSE thinking_step_end ✓
        C-->>FE: SSE text (streams analysis + forecast)

    else Contract resolution (evaluation window closed)
        C-->>FE: SSE thinking_step_start "Resolving contract & settling escrow..."
        C->>AG: POST /agent/resolve
        AG->>AG: deterministic engine: spend ≥ min AND roas ≥ target
        AG-->>ARC: release() or refund()
        ARC-->>AG: settlement tx_hash
        AG-->>CIRCLE: USDC transferred to agent wallet (success path)
        AG-->>C: { outcome, final_roas, final_spend, tx_hash }
        C-->>FE: SSE thinking_step_detail (outcome + tx_hash)
        C-->>FE: SSE thinking_step_end ✓
        C-->>FE: SSE contract_status { status: Settled }
        C-->>FE: SSE text (streams resolution summary)
    end
```

---

## 5. 24h Monitoring Tick (Background)

APScheduler runs this loop independently for every Active contract. Not triggered by the conductor.

```mermaid
sequenceDiagram
    participant S as APScheduler (every 24h)
    participant DB as PostgreSQL
    participant ML as ML Forecast Model
    participant LLM as Claude (LLM Decision)
    participant MCP as Meta Ads MCP

    S->>DB: 1. Expire stale approval_request cards\n(status: pending AND created_at < now - 24h → expired)

    S->>DB: 2. Load execution_receipts\n(campaign_id + ad_set_ids from strategy_plans)

    S->>MCP: 3. get_adset_insights(ad_set_ids)\nget real spend / revenue / ROAS / CTR per ad set

    S->>ML: 4. Run live forecast model\n(current_spend, current_roas, days_elapsed, days_remaining)
    ML-->>S: { predicted_final_roas, success_probability, status: on_track/at_risk/critical }

    S->>LLM: 5. LLM decision\n(ad-set breakdown + ML forecast)\nWhich ad_sets to scale / pause / swap / adjust creative?
    LLM-->>S: structured action list\n(each action references real ad_set_id from receipts)

    S->>DB: 6. Write daily_update message\n(real metrics + ML forecast snapshot)

    alt Manual approval mode
        S->>DB: 7a. Write approval_request card per action\nurgency level based on ROAS trajectory\nexpires_at = now + 23h
        Note over DB: Merchant approves/declines via /actions/:id/approve
        Note over S: Next tick expires unanswered cards and starts fresh
    else Auto mode
        S->>MCP: 7b. Execute all actions immediately\nupdate_adset(ad_set_id, daily_budget) or\nupdate_adset(ad_set_id, status: PAUSED)
        S->>DB: Write system_event per action executed
    end

    S->>DB: 8. Update execution_receipts with any new/modified IDs
```

### Urgency Levels on Approval Cards

| Level | Condition | Frontend Behaviour |
|---|---|---|
| `recommended` | Normal optimization opportunity | Standard card |
| `urgent` | ROAS trending below target, ≥3 days remaining | Card highlighted, push notification |
| `critical` | ROAS critically off track, ≤2 days remaining | Card pinned to top, notification repeated |

---

## 6. Chat Q&A Flow (Isolated Path)

The `/agent/chat` stream endpoint is structurally isolated from the execution path. No Meta Ads adapter, no Arc calls — read-only grounded Q&A only.

```mermaid
sequenceDiagram
    actor M as Merchant
    participant FE as Frontend
    participant AG as Agent Service (chat route)
    participant DB as PostgreSQL

    M->>FE: types question in chat
    FE->>AG: POST /agent/chat/stream (X-Service-Token)

    AG->>DB: load contract state + audit_events + contract_messages
    Note over AG: Claude answers from DB context only\nNO execution adapter imports in this module

    AG-->>FE: SSE text stream (word-by-word answer)
    FE-->>M: renders answer in agent bubble
```

---

## 7. Settings & Account Connection

```mermaid
flowchart TD
    S["Settings Screen"]

    S --> |"Connect Meta Ads account"| MA["Enter Meta Ads Account ID\n(act_XXXXXXXXX)\nSaved to users.meta_ads_account_id\nPassed in every agent request body —\nnever asked during negotiation"]

    S --> |"Approval mode"| AM["Toggle: Manual ↔ Auto\nManual: approval cards per action (23h expiry)\nAuto: agent executes immediately\nApplies to monitoring tick only\nInitial 4 strategy cards always require manual approval"]

    S --> |"Wallet"| WC["Circle App Kit (SIWE)\nSign-In With Ethereum\nDrop-in browser wallet component\nUsed at escrow funding step"]
```

---

## 8. SSE Event Contract

Events emitted by the conductor in order:

| Event | Payload | Frontend Action |
|---|---|---|
| `thinking_step_start` | `{ step_id, label, thinking_sequence_id }` | Opens a new ThinkingStep row with pulsing dot |
| `thinking_step_detail` | `{ delta }` | Appends to the active step's live detail (streaming cursor) |
| `thinking_step_end` | `{ step_id, thinking_sequence_id }` | Marks step complete, shows green ✓ |
| `thinking_end` | `{ thinking_sequence_id }` | Collapses block to "Thought for N steps" |
| `text` | `{ delta }` | Appends to the agent message bubble (word-fade animation) |
| `approval_required` | `{ contract_id, action_id, title, detail, urgency, expires_at }` | Renders AgentActionCard with Approve / Decline buttons |
| `contract_status` | `{ status }` | Updates right-panel status badge without page reload |
| `error` | `{ message, correlation_id }` | Shows inline error, stops spinner |

---

## 9. Tool List (What Claude Can Call)

```mermaid
graph LR
    subgraph "Conductor Tools"
        T1["check_contract_state\n→ reads DB\n(status, terms, messages, performance)"]
        T2["run_ml_underwriting\n→ agent /underwrite\n→ probability + risk_level + fee"]
        T3["generate_agent_offer\n→ agent /agent-offer\n→ accept / counteroffer / reject"]
        T4["generate_ad_strategy\n→ agent /generate-plan\n→ MCP pull + LLM plan + 4 cards"]
        T5["request_merchant_approval\n→ emits SSE approval_required\n→ polls DB every 5s"]
        T6["execute_ad_actions\n→ agent /execute-ads-actions\n→ MCP create_campaign etc."]
        T7["check_performance\n→ agent /performance\n→ MCP insights + ML forecast"]
        T8["resolve_contract\n→ agent /resolve\n→ deterministic engine + Arc settle"]
    end

    subgraph "Decision Logic (Claude)"
        Q{{"What does\nthe merchant\nneed?"}}
    end

    Q -->|"general Q&A"| T1
    Q -->|"status = Created"| T2
    Q -->|"status = Underwriting"| T3
    Q -->|"status = Funded"| T4
    T4 -->|"manual mode"| T5
    T5 -->|"all approved"| T6
    T4 -->|"auto mode"| T6
    Q -->|"status = Active"| T7
    Q -->|"window closed"| T8
```

---

## 10. Meta Ads MCP Tools Reference

| MCP Tool | When Used | Purpose |
|---|---|---|
| `mcp_meta_ads_get_campaigns` | Strategy generation (step 5) | List active/recent campaigns |
| `mcp_meta_ads_get_insights` | Strategy generation + monitoring | Performance data (spend, revenue, ROAS, CTR) |
| `mcp_meta_ads_get_adsets` | Strategy generation | Audience targeting configs |
| `mcp_meta_ads_get_ad_creatives` | Strategy generation | Creative performance by ROAS |
| `mcp_meta_ads_create_campaign` | Execute-ads (Day 1) | Create campaign (`OUTCOME_SALES`) |
| `mcp_meta_ads_create_adset` | Execute-ads (Day 1) | Create ad set with targeting + daily_budget |
| `mcp_meta_ads_create_ad_creative` | Execute-ads (Day 1) | Create creative with headline + CTA |
| `mcp_meta_ads_create_ad` | Execute-ads (Day 1) | Attach creative to ad set |
| `mcp_meta_ads_update_adset` | Monitoring tick | Scale (`daily_budget++`) or pause (`status: PAUSED`) |
| `mcp_meta_ads_update_campaign` | Monitoring tick | Pause or activate at campaign level |

---

## 11. Circle Stack

| Circle Product | How Bidtopus Uses It | Lifecycle Step |
|---|---|---|
| **Arc Escrow** | USDC locked at contract signing. Released on success, refunded on failure. Code enforces the guarantee — not the agent's word. | Step 4: Fund · Step 9: Settle |
| **Circle Wallets** | Agent's receiving wallet. Automated HSM-backed key management — agent never touches a raw private key. | Step 9: Success path |
| **Paymaster** | All on-chain transactions (fund, release, refund) pay gas in USDC. No volatile gas token. ~$0.01/tx vs $5–30 on Ethereum. | Steps 4, 9 |
| **App Kit** | Drop-in wallet component in the merchant's browser. One-click USDC funding via SIWE. No MetaMask required. | Step 4: Fund Escrow |
| **USYC** *(roadmap)* | Park idle escrowed USDC in yield while contract is Active. Convert back at resolution. | Active state (days 1–7) |

---

## 12. What Stays Unchanged

- **Agent service** — zero changes. All existing HTTP endpoints remain as-is.
- **Frontend ThinkingBlock** — already supports multi-step live streaming with pulsing dot → green ✓.
- **DB state machine** — conductor reads and advances it; doesn't replace it.
- **Auth** — Clerk JWT on conductor entry, `X-Service-Token` on all backend↔agent calls.
- **Negotiation flow** — the pre-contract negotiation Claude stays in `backend/routes/negotiation.py` (different UX context, multi-turn loop).
- **Monitoring loop** — APScheduler in the agent service runs independently; the conductor reads its output but doesn't replace it.
