# OutcomeX — Frontend

## Purpose
The frontend is the merchant-facing web app. It guides the merchant through the full lifecycle of a performance contract: creating it, reviewing the agent's decision, funding escrow, approving the strategy, monitoring the campaign, and seeing the final settlement.

## What Needs to Be Built

### 1. Landing Page
Explains the OutcomeX model to new visitors. Core message: merchants pay only when the AI agent delivers the contracted marketing outcome. Includes a clear call-to-action to create a contract.

### 2. Contract Builder
A form where the merchant defines the performance contract:
- Target metric (ROAS)
- Target threshold (e.g. >= 2.0)
- Minimum ad spend required
- Evaluation time window (e.g. 7 days)
- Success fee in USDC
- Campaign mode (create new or optimize existing)

### 3. Agent Evaluation Screen
Displays the agent's underwriting result after it analyzes the contract request:
- Estimated success probability
- Risk level
- Agent decision: accept, counteroffer, or reject
- Human-readable explanation from the LLM

### 4. Escrow Funding Screen
Shown after the merchant accepts the agent's offer:
- Summary of final agreed contract terms
- USDC amount to be escrowed
- Wallet connection and funding action
- Confirmation of escrow status on Arc

### 5. Strategy Approval Screen
Displays the agent's proposed Meta Ads strategy:
- Strategy summary in plain language
- Structured list of planned ad actions
- Merchant approve button (no execution happens without explicit approval)

### 6. Live Monitoring Dashboard
Shows real-time campaign progress while the contract is active:
- Current spend vs. minimum spend threshold
- Current ROAS vs. target ROAS
- Days remaining in evaluation window
- ML-estimated probability of success
- Contract status indicator

### 7. Resolution & Settlement Screen
Shown when the evaluation window closes:
- Final metrics (spend, revenue, ROAS)
- Outcome: success or failure
- Settlement action: USDC released to agent or refunded to merchant
- On-chain transaction proof / hash
