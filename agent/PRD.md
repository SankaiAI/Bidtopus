# OutcomeX — Agent Sub-PRD
**Version 1.1 | Hackathon MVP**

---

## 1. Purpose

The agent is the core of OutcomeX. It is an autonomous economic agent: it evaluates risk, makes decisions, executes marketing actions, monitors outcomes, and triggers financial settlement. It is not a chatbot or a text generator — it is an economic actor that shares outcome risk with the merchant and only earns when it delivers.

The agent combines two complementary systems:
- **ML models** — quantitative risk estimation (underwriting, live forecasting)
- **LLM** — reasoning, explanation, negotiation, and strategy generation

Neither system operates alone. ML produces numbers. LLM interprets them and communicates them. Deterministic logic makes the final settlement call.

---

## 2. Recommended Tech Stack

| Concern | Technology |
|---|---|
| Language | Python |
| ML models | scikit-learn (Logistic Regression baseline), XGBoost or LightGBM preferred |
| LLM | Claude (claude-sonnet-4-6) with structured JSON tool use |
| Ads integration | Meta Ads MCP if available; adapter-backed mock otherwise |
| Agent wallet | Circle Wallets — embedded secure wallet with automated key management for autonomous agents |
| Web3 client | viem / ethers.js (via subprocess or HTTP call to contracts layer) |
| Fee handling | Arc Paymaster — all agent transaction fees paid in USDC, no native gas token required |

---

## 3. What the LLM Must and Must Not Do

This boundary is critical. The LLM handles interpretation and communication. It never makes the final numerical determination.

| LLM should do | LLM should NOT do |
|---|---|
| Interpret the merchant's contract request | Directly decide whether 2.25 >= 2.0 |
| Explain the underwriting output in plain language | Replace deterministic settlement logic |
| Generate counteroffers (revised target, fee, window) | Be the sole oracle for the final resolution result |
| Produce a structured strategy plan | Move funds or trigger escrow actions on its own |
| Narrate the final resolution to the merchant | Override backend state machine rules |

All LLM outputs used in decisions must be structured JSON, validated by the backend before any action is taken.

---

## 4. Components to Build

### 4.1 ML Contract Underwriting Model

**Primary question:** "If I accept this contract, how likely am I to achieve the target?"

**Inputs (features):**

| Feature | Description |
|---|---|
| historical_roas_7d | Merchant's recent 7-day ROAS baseline |
| historical_roas_30d | Merchant's 30-day ROAS baseline |
| avg_daily_spend | Average daily ad spend |
| requested_target_roas | The ROAS threshold the merchant wants |
| minimum_spend | Spend floor before resolution is valid |
| time_window_days | Evaluation window length |
| campaign_type | New campaign vs. optimize existing |
| aov | Average order value, if available |

**Outputs:**
```json
{
  "success_probability": 0.68,
  "risk_level": "medium",
  "expected_roas_range": [1.7, 2.4],
  "recommended_contract_action": "accept",
  "recommended_fee_usdc": 100
}
```

**Decision policy:**
| Probability | Agent action |
|---|---|
| >= 65% | Accept |
| 35% – 64% | Counteroffer |
| < 35% | Reject or request revised terms |

**Model type:** Logistic Regression as baseline; XGBoost or LightGBM preferred. If real historical data is unavailable, generate a synthetic dataset that produces plausible outputs for the demo.

---

### 4.2 LLM Contract Negotiation Layer

**Primary question:** "How do I explain this underwriting result to the merchant and what do I offer?"

**Inputs:** The full underwriting output from 4.1 plus the original contract request.

**Outputs (structured JSON):**
```json
{
  "offer_type": "accept",
  "message": "I estimate a 68% chance of achieving ROAS >= 2.0 within 7 days. I accept this contract.",
  "revised_threshold": null,
  "revised_fee_usdc": null,
  "revised_time_window_days": null
}
```

**Three possible offer types:**

| Offer type | Example message |
|---|---|
| Accept | "I estimate a 68% chance of achieving ROAS >= 2.0 within 7 days. I accept this contract." |
| Counteroffer | "ROAS >= 3.0 is too aggressive. I propose ROAS >= 2.0 for 100 USDC or ROAS >= 3.0 with a 14-day window and a higher fee." |
| Reject | "The requested target has an estimated success probability below 20%; I cannot responsibly accept it." |

**Fee recommendation logic the LLM must follow:**
- Higher target difficulty → higher success fee recommendation
- Lower success probability → higher success fee or rejection
- Longer time window → lower relative execution risk
- Higher budget or business impact → higher value ceiling for the agent fee

---

### 4.3 LLM Strategy Generator

**Primary question:** "What Meta Ads strategy should I run to hit the contracted target?"

**Inputs:** Approved contract terms (target ROAS, spend floor, time window, campaign mode) and merchant ad account context.

**Outputs (structured JSON):**
```json
{
  "strategy_summary": "Launch a retargeting campaign focused on warm audiences with a value-oriented product angle.",
  "actions": [
    {"type": "create_campaign", "objective": "sales"},
    {"type": "create_ad_set", "audience": "30-day website visitors"},
    {"type": "set_budget", "daily_budget_usd": 75}
  ]
}
```

The strategy is presented to the merchant for approval before any action executes. The LLM generates the plan; the merchant authorizes it; the Meta Ads adapter executes it.

---

### 4.4 ML Live Outcome Forecast Model

**Primary question:** "Given current campaign progress, will this contract likely succeed by the deadline?"

**Inputs:**
- Current spend
- Current revenue
- Current ROAS
- Days elapsed
- Days remaining
- Original contracted target and spend floor

**Outputs:**
```json
{
  "predicted_final_roas": 2.1,
  "success_probability": 0.61,
  "status": "on_track"
}
```

**Model type:** Gradient boosting regression/classification or a rule-based + model hybrid for MVP.

This model runs continuously while the contract is Active and feeds the live monitoring dashboard.

---

### 4.5 Deterministic Resolution Engine

**Primary question:** "Did the merchant's contracted outcome get achieved?"

This is pure deterministic logic. No ML. No LLM. The agent's payment depends on this — it must be unambiguous and auditable.

```
IF total_spend >= minimum_spend
AND final_roas >= target_roas
AND evaluation_window_complete
THEN outcome = success
ELSE outcome = failure
```

**Output:**
```json
{
  "outcome": "success",
  "final_spend": 545,
  "final_revenue": 1226,
  "final_roas": 2.25,
  "threshold": 2.0,
  "minimum_spend": 500,
  "minimum_spend_met": true,
  "target_met": true
}
```

On success: calls Arc escrow adapter to release USDC to agent wallet.
On failure: calls Arc escrow adapter to refund USDC to merchant wallet.

---

### 4.6 Meta Ads Adapter

**Purpose:** Pluggable interface between the agent and Meta Ads. The adapter abstracts the execution layer so the demo works regardless of whether real Meta Ads MCP access is available.

**Must support:**
- Reading current campaign performance (spend, revenue, ROAS)
- Creating a campaign
- Creating an ad set with audience targeting
- Setting a daily budget

**Implementation priority:**
1. Real Meta Ads MCP integration if access is available
2. Adapter-backed mock that returns plausible structured data for the demo

The mock must return realistic progression data so the monitoring dashboard tells a coherent story.

---

### 4.7 Arc Escrow Adapter

**Purpose:** Interface between the agent's resolution engine and the on-chain escrow contract deployed on Arc.

**Must support:**
- Reading current escrow status (funded / released / refunded)
- Triggering release: send USDC to agent wallet on success
- Triggering refund: return USDC to merchant wallet on failure

Returns an Arc transaction hash for each settlement action, which the backend logs and the frontend displays as on-chain proof.

**Arc specifics:**
- Sub-second finality means settlement confirms immediately — no polling needed
- ~$0.01 fees per transaction, covered by the Paymaster in USDC
- Uses the ABI and contract address exported from `contracts/`

### 4.8 Circle Wallets Integration

**Purpose:** The agent needs its own autonomous wallet to receive USDC on successful settlement. Use Circle's Wallets product for this — it provides embedded secure wallets with automated key management designed for autonomous agents.

**Must support:**
- Agent wallet creation and address provisioning
- Receiving USDC from the Arc escrow contract on success
- Reporting agent wallet balance (for audit and transparency)

This is a Circle tool usage requirement (20% of judging). The merchant wallet can also optionally use Circle Wallets for a consistent experience.

---

### 4.9 Audit Logger

Every agent action must be logged with a timestamp:
- Underwriting model called (inputs + outputs)
- LLM offer generated (offer type + message)
- Strategy plan generated
- Ad actions executed (each action individually)
- Live forecast snapshot recorded
- Resolution engine called (inputs + deterministic output)
- Settlement triggered (release or refund + tx hash)

This is the evidence trail that makes every agent decision auditable after the fact.

---

## 5. Agent Orchestrator

The orchestrator is the entry point called by the backend. It sequences the components above in response to each API call:

| Backend call | Orchestrator action |
|---|---|
| `/underwrite` | Run ML underwriting model → return result |
| `/agent-offer` | Pass underwriting result to LLM negotiation layer → return offer |
| `/generate-strategy` | Call LLM strategy generator → return plan |
| `/execute-ads-actions` | Call Meta Ads adapter with approved actions |
| `/performance` | Call Meta Ads adapter for current data + run live forecast model |
| `/resolve` | Run deterministic resolution engine → call Arc escrow adapter |

---

## 6. Safety & Trust Rules

- No ad execution occurs unless `strategy_plans.approval_status = approved` is confirmed by the backend before the adapter is called.
- The resolution engine output is never modified by the LLM. LLM may narrate the result but cannot change it.
- The Arc escrow adapter only triggers settlement after the deterministic engine has produced a final outcome.
- All inputs and outputs to every component are logged before and after each call.

---

## 7. MVP Acceptance Criteria (Agent)

- [ ] ML underwriting model returns probability, risk level, expected ROAS range, and fee recommendation.
- [ ] LLM negotiation layer produces accept, counteroffer, and reject outputs in structured JSON.
- [ ] LLM strategy generator produces a structured plan with a summary and action list.
- [ ] Live forecast model returns updated probability and predicted final ROAS from current snapshot data.
- [ ] Deterministic resolution engine correctly evaluates success/failure based on final metrics.
- [ ] Meta Ads adapter executes (or mocks) create campaign, create ad set, and set budget actions.
- [ ] Arc escrow adapter triggers release or refund and returns a real Arc tx hash.
- [ ] Circle Wallets is used for the agent's receiving wallet.
- [ ] Paymaster is wired so agent's on-chain calls are fee-sponsored in USDC.
- [ ] Audit logger records every component call with inputs, outputs, and timestamp.

---

## 8. Non-Goals for MVP

- Multi-agent bidding or competition
- Creative generation (ad copy, images)
- Google Ads, TikTok Ads, or any non-Meta channel
- Mid-flight strategy adjustment (stretch goal only)
- Complex attribution modeling beyond reported ROAS

---

## 9. Judging Context

This folder directly influences the highest-weighted judging criteria:
- **Agentic Sophistication (30%)** — the agent must make real decisions (accept/reject contracts, underwrite risk, negotiate terms) not just automate predefined steps. Judges distinguish "full autonomy" from "AI-flavored automation."
- **Circle tool usage (20%)** — Circle Wallets for the agent wallet and Paymaster for fee handling are required here. Gateway Nanopayments are a stretch goal.
- **Traction (30%)** — this agent must be able to process real merchant contracts with real USDC during the event window (May 11–25).

---

## 10. Stretch Goals (Agent)

| Goal | What to build |
|---|---|
| Dynamic fee pricing | Agent recalculates and proposes fees based on target difficulty in real time |
| Mid-flight campaign adjustments | Agent shifts budget or activates a backup strategy based on live forecast dropping below threshold |
| Benchmark intelligence | Underwriting model uses vertical/AOV/geography priors to improve probability estimates |
| CPA + ROAS dual target | Resolution engine evaluates both metrics; both must pass for success |
| Gateway Nanopayments | Use Circle's Nanopayments for micro-fee splits or agentic commerce within the execution loop |
| USYC yield on idle escrow | Park escrowed USDC in USYC while the contract is Active; convert back at resolution |

---

## 11. Dependencies

| Needs from | What |
|---|---|
| `backend/` | Called by backend endpoints; must match expected input/output shapes |
| `contracts/` | Arc escrow contract ABI and address for the escrow adapter |
| Circle Wallets API | Agent wallet provisioning and management |
| Arc Paymaster | Fee sponsorship for all on-chain agent actions |
| Training data | Real or synthetic historical ad performance data for ML model training |
