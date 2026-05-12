# OutcomeX — Agent

## Purpose
The agent is the core of the product. It is an autonomous economic agent that evaluates performance contracts, negotiates terms, executes marketing strategies, monitors outcomes, and triggers settlement. It combines ML models for quantitative risk estimation with an LLM for reasoning, explanation, and strategy generation.

## What Needs to Be Built

### 1. ML Underwriting Model
Answers: "If I accept this contract, how likely am I to achieve the target?"
- Takes contract parameters as input (target ROAS, spend floor, time window, historical account performance)
- Outputs a success probability (0–1), risk level, and a suggested decision (accept / counteroffer / reject)
- Decision policy: >= 65% → accept, 35–64% → counteroffer, < 35% → reject
- Model type: Logistic Regression baseline, XGBoost/LightGBM preferred
- Requires a training dataset (real or synthetic historical ad performance data)

### 2. LLM Negotiation Layer
Answers: "How do I explain this decision to the merchant and what do I propose?"
- Receives the ML underwriting output
- Generates a merchant-facing explanation in plain language
- Produces structured counteroffers when the ML recommends one (revised target, revised fee, extended window)
- Returns a structured JSON decision the backend can act on
- Must never be the source of truth for final numerical settlement

### 3. LLM Strategy Generator
Answers: "What Meta Ads strategy should I run to hit this target?"
- Receives the approved contract terms and account context
- Generates a structured campaign strategy: objective, audience, budget allocation, ad approach
- Output is shown to the merchant for approval before any execution happens

### 4. ML Live Outcome Forecast Model
Answers: "Given current campaign progress, will this contract likely succeed by the deadline?"
- Runs continuously while the contract is active
- Takes current spend, revenue, ROAS, days elapsed, and days remaining as inputs
- Outputs predicted final ROAS and updated probability of success
- Feeds the live monitoring dashboard

### 5. Deterministic Resolution Engine
Answers: "Did the merchant's contracted outcome get achieved?"
- Applies the exact IF/THEN logic defined in the contract:
  - total spend >= minimum spend threshold
  - AND final ROAS >= target ROAS
  - AND evaluation window is complete
- Outputs: success or failure
- This is never delegated to the LLM — it is pure deterministic logic

### 6. Meta Ads Adapter
The execution interface between the agent and Meta Ads:
- Reads current campaign performance data
- Executes approved campaign actions (create campaign, create ad set, set budget, etc.)
- Must have a mock/adapter fallback for demo use if real Meta Ads MCP access is unavailable

### 7. Arc Escrow Adapter
The interface between the agent and the on-chain escrow contract:
- Triggers USDC release to the agent wallet on success
- Triggers USDC refund to the merchant wallet on failure
- Reads current escrow status

### 8. Audit Logger
Records every agent action with a timestamp:
- Underwriting decision and inputs
- LLM outputs (offer text, strategy plan)
- Execution actions taken
- Monitoring snapshots
- Resolution decision and settlement trigger
