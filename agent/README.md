# OutcomeX — Agent

## Purpose
The agent is the core of the product. It is an autonomous economic agent that evaluates performance contracts, negotiates terms, executes marketing strategies, monitors outcomes, and triggers settlement. It combines ML models for quantitative risk estimation with an LLM for reasoning, explanation, and strategy generation.

**Start here:** Read [AGENT.md](AGENT.md) before any component file. It is the table of contents for everything below.

---

## Engineering Principles (Read Before Building)

These come from Anthropic and OpenAI's published lessons on production autonomous agents.

---

### Principle 1: No Keyword Routing

The most common agent mistake. Never parse text to decide what action to take.

**Wrong:**
```python
if "ROAS" in message: call_underwriting()
elif "strategy" in message: call_strategy_generator()
else: default_response()  # breaks on every edge case
```

**Right — two patterns, used in different places:**

For the **orchestrator** (what to do next in the workflow): the contract's current state determines the next valid action. No text parsing.

```python
VALID_ACTIONS = {
    "Created":       ["run_underwriting"],
    "Underwriting":  ["generate_offer"],
    "Offered":       ["await_merchant_response"],
    "Funded":        ["generate_strategy"],
    "Active":        ["run_daily_monitoring", "execute_optimization"],
    "Resolving":     ["run_resolution_engine"],
}
```

For the **chat endpoint** (answering merchant questions): give Claude a set of tools and let it decide which to call.

```python
tools = [
    {"name": "get_live_performance",  "description": "Get current ROAS, spend, revenue"},
    {"name": "get_forecast",          "description": "Get ML prediction for contract success"},
    {"name": "get_contract_terms",    "description": "Get agreed target, fee, window, strategy"},
    {"name": "request_strategy_change","description": "Queue adjustment for merchant approval"},
]
response = claude.messages.create(model="claude-sonnet-4-6", tools=tools, messages=[...])
```

---

### Principle 2: Three Interaction Modes — Never Mix Them

```mermaid
graph LR
    Merchant -->|chat message| ChatEndpoint
    ChatEndpoint -->|reads state| DB[(Database)]
    Scheduler -->|runs daily| MonitoringLoop
    MonitoringLoop -->|writes snapshots| DB
    NegotiationLoop -->|reads + writes turns| DB
    Frontend -->|polls GET /performance| Backend
    Backend -->|reads| DB
```

| Mode | Triggered by | Pattern |
|---|---|---|
| **Negotiation loop** | Merchant submits contract | Sequential turns, each turn persisted to DB. Loop exits when agent reaches accept or reject. |
| **Background scheduler** | Contract status → Active | APScheduler job every 24h. Runs independently of any user request. Writes snapshots to DB. |
| **Chat Q&A** | Merchant sends a message | Read current DB state + audit log. Answer with Claude. No execution. |

The UI reads from DB. The scheduler writes to DB. They never block each other.

---

### Principle 3: The Iterative Loop Pattern — Agent Decides When to Stop

From Anthropic's multi-agent article: the agent decides when the loop exits, not the frontend, not a fixed counter. The termination condition is evaluated by the agent itself.

```python
def negotiation_loop(contract_id: str):
    while True:
        state = db.get_contract_state(contract_id)

        # Save intent BEFORE executing (checkpoint pattern)
        audit_logger.log(contract_id, "negotiation_step", {"state": state})

        underwriting = run_underwriting(state)
        offer = generate_offer(underwriting)

        db.save_offer(contract_id, offer)

        if offer.offer_type in ("accept", "reject"):
            break  # Agent decides to exit — not a timer, not the frontend

        merchant_response = db.poll_merchant_response(contract_id)
        db.save_negotiation_turn(contract_id, merchant_response)
```

The same pattern applies to the monitoring loop:
```python
def monitoring_loop(contract_id: str):
    while True:
        snapshot = meta_ads_adapter.get_performance(contract_id)
        audit_logger.log(contract_id, "snapshot_before", snapshot)

        forecast = forecast_model.predict(snapshot)

        if needs_optimization(forecast):
            action = generate_optimization(forecast)
            audit_logger.log(contract_id, "intent", action)     # log BEFORE
            meta_ads_adapter.execute(action)
            audit_logger.log(contract_id, "executed", action)   # log AFTER

        if is_contract_resolved(snapshot):
            resolution_engine.resolve(contract_id)
            break  # Agent exits when it determines the outcome, not on a timer

        sleep_until_next_day()
```

---

### Principle 4: Save State Before Acting (Checkpoint Pattern)

From OpenAI's observability diagrams: the agent saves its plan to memory **before** executing. This enables crash recovery for 7-day contracts.

```python
def orchestrator_step(contract_id: str, action: str, inputs: dict):
    # Step 1: persist intent — crash here means no action was taken
    audit_logger.log(contract_id, "intent", {"action": action, "inputs": inputs})

    # Step 2: execute
    result = execute(action, inputs)

    # Step 3: persist result — crash here means action happened, result is known
    audit_logger.log(contract_id, "result", {"action": action, "result": result})

    return result
```

If the process restarts, read the last intent from audit_logger to determine where to resume.

---

### Principle 5: Dual-Write — Audit Logger + Message Store

Every notable agent action writes to **two** stores. Never conflate them.

```python
# When the agent generates a negotiation offer:

# Write 1 — internal (always, every component call)
audit_logger.log(contract_id, "llm_negotiation", "result", offer.model_dump())

# Write 2 — UI (only when the merchant should see something new)
messages_repo.append(contract_id,
    role="agent", type="message",
    content=offer.message,
    metadata={"offer_type": offer.offer_type, "probability": underwriting.success_probability}
)
```

What each component writes to `contract_messages`:

| Component | `type` | When |
|---|---|---|
| Orchestrator | `system_event` | Contract created, escrow confirmed, campaign launched, settled |
| LLM Negotiation | `message` | Offer generated (accept / counteroffer / reject) |
| LLM Strategy | `approval_request` (status=`pending`) | Strategy plan ready for merchant review |
| Background Scheduler | `daily_update` | Each daily monitoring tick with ROAS + forecast |
| Orchestrator (optimization) | `approval_request` (status=`pending`) | Budget shift > threshold, needs merchant approval |
| Resolution Engine | `message` | Outcome narration after deterministic resolution |

### Principle 6: The Audit Logger is Queryable, Not Write-Only

From OpenAI's observability stack: the agent needs to **query its own history** to reason about it.

```python
# These query patterns must work from day 1:
audit_logger.get_all(contract_id)                        # full history
audit_logger.get_latest_snapshot(contract_id)            # most recent performance data
audit_logger.get_by_component(contract_id, "llm")        # all LLM decisions
audit_logger.get_by_component(contract_id, "resolution") # final resolution inputs/outputs
audit_logger.get_since(contract_id, days_ago=3)          # recent events for chat Q&A
```

The chat endpoint uses `get_since()` to give Claude context for answering "how are we tracking?" without loading the full 7-day history.

---

### Principle 6: Layered Domain Architecture

From OpenAI's Codex engineering: **one-way dependency rule** — no layer imports from a layer above it. Enforced by file structure, not by discipline.

```
Utils  ←──────────────────────────────────────────────┐
                                                       │ (used by all)
Types → Config → Repo → Service → Orchestrator → FastAPI endpoints
                   ↑
              Providers (Meta Ads, Arc, Circle)
              └──→ Orchestrator
```

| Layer | Files | Rule |
|---|---|---|
| **Types** | `models/types.py` | Pydantic models only — no logic, no imports from above |
| **Config** | `config.py` | Thresholds, env vars, decision policy constants |
| **Repo** | `db/repo.py` + `db/audit_logger.py` | DB reads/writes only — no business logic |
| **Service** | `ml/`, `llm/`, `engine/` | Business logic — imports Types, Config, Repo only |
| **Providers** | `adapters/` | External API calls — imports Types only |
| **Orchestrator** | `orchestrator.py` | Sequences Service + Provider calls — imports everything below |
| **Utils** | `utils/` | Shared helpers — no business logic, no upward imports |

---

### Principle 7: What the LLM Can and Cannot Do

The LLM is sandwiched between a JSON validator and a state gate. It cannot bypass either.

```
Merchant input
     ↓
   LLM (interprets, reasons, generates)
     ↓
JSON schema validator  ← LLM output is rejected here if invalid
     ↓
State gate check       ← action is blocked here if contract state is wrong
     ↓
Executor (adapter or engine)
```

| LLM CAN do | LLM CANNOT do |
|---|---|
| Explain underwriting output | Determine if 2.25 >= 2.0 |
| Generate counteroffers | Override the resolution engine |
| Produce strategy plans | Move funds or call escrow adapters directly |
| Narrate the outcome | Change the deterministic settlement result |

---

## Security Rules

### Merchant Input Never in the System Prompt

Every merchant-controlled field (`campaign_goal`, `account_context`, chat messages) goes in the `user` turn as structured JSON — never interpolated into the `system` prompt. The system prompt is a fixed constant.

```python
# WRONG — merchant text in system prompt = prompt injection risk
system = f"You manage campaigns. Goal: {contract.campaign_goal}"

# CORRECT — system prompt is a constant, merchant data is structured user input
response = claude.messages.create(
    system=FIXED_NEGOTIATION_SYSTEM_PROMPT,
    messages=[{"role": "user", "content": json.dumps(contract_terms.model_dump())}]
)
```

The ML model calculates the probability — not the LLM. Even a successfully injected prompt cannot change the number that drives the accept/reject decision.

### JSON Validation Blocks Every LLM Output

Every LLM response is validated by a Pydantic model with explicit field constraints before any action. Invalid output raises `SafeAgentError` — never silently defaults.

```python
try:
    offer = AgentOffer.model_validate_json(raw_output)
except ValidationError as e:
    audit_logger.log(contract_id, "llm_negotiation", "error", {"error": str(e)})
    raise SafeAgentError("LLM output failed schema validation")
```

### Chat Handler Has Zero Imports from Execution Modules

Verified by a structural test in `tests/test_security.py`. The chat route file must never import `arc_escrow_adapter`, `meta_ads_adapter`, `resolution_engine`, or `orchestrator`.

### `AccountContext` Rejects Unknown Fields

```python
class AccountContext(BaseModel):
    model_config = ConfigDict(extra="forbid")  # unknown keys = 422 at API boundary
    account_id: str = Field(pattern=r"^act_\d+$")
    pixel_id:   str | None = Field(None, pattern=r"^\d+$")
```

### Approval Status Re-Read from DB with Row Lock

```python
strategy = db.query(StrategyPlan).filter_by(contract_id=contract_id).with_for_update().first()
if not strategy or strategy.approval_status != "approved":
    raise SafeAgentError("Approval gate: strategy not approved in DB")
```

### Negotiation Loop Has a Turn Limit

```python
MAX_NEGOTIATION_TURNS = 5
if turn_count >= MAX_NEGOTIATION_TURNS:
    # Auto-reject — prevents runaway API cost from adversarial looping
```

→ Full security reference with all rules and code examples: [docs/security.md](docs/security.md)

---

## File Structure

```
agent/
├── AGENT.md                  ← ~100 lines, table of contents (read first)
├── orchestrator.py           ← Entry point — sequences components by contract state
├── config.py                 ← All thresholds and decision policy constants
├── models/
│   └── types.py              ← Pydantic models for all inputs/outputs
├── ml/
│   ├── underwriting.py       ← ML Contract Underwriting Model
│   └── forecast.py           ← ML Live Outcome Forecast Model
├── llm/
│   ├── negotiation.py        ← LLM Negotiation Layer (extended thinking)
│   └── strategy.py           ← LLM Strategy Generator (extended thinking)
├── engine/
│   └── resolution.py         ← Deterministic Resolution Engine — no LLM here
├── adapters/
│   ├── meta_ads.py           ← Meta Ads Adapter (real + mock)
│   ├── arc_escrow.py         ← Arc Escrow Adapter
│   └── circle_wallets.py     ← Circle Wallets Integration
├── db/
│   ├── audit_logger.py       ← Internal observability store (queryable)
│   └── messages_repo.py      ← Merchant-facing UI timeline store
├── docs/
│   ├── lifecycle.md          ← State machine, valid transitions
│   ├── underwriting.md       ← ML model inputs, outputs, thresholds
│   ├── negotiation.md        ← Negotiation loop, offer types, fee logic
│   ├── safety-rules.md       ← Hard constraints — structural, not prompts
│   ├── meta-ads.md           ← Adapter actions, mock data, realistic progression
│   └── observability.md      ← Audit logger schema, query patterns, crash recovery
└── tests/
    └── evals/                ← 20+ test scenarios for LLM output validation
```

---

## Build Order

Build in this order — each step depends only on layers already complete.

1. `models/types.py` — all Pydantic models (Types layer, no dependencies)
2. `config.py` — all thresholds (Config layer)
3. `db/audit_logger.py` — queryable from day 1 (Repo layer)
4. `db/messages_repo.py` — `append()`, `get_all()`, `update_status()` (Repo layer)
4. `engine/resolution.py` — pure deterministic logic (Service layer, no LLM)
5. `ml/underwriting.py` — with synthetic training data (Service layer)
6. `ml/forecast.py` — gradient boosting or rule-based hybrid (Service layer)
7. `adapters/meta_ads.py` — mock adapter first, real later (Providers layer)
8. `adapters/arc_escrow.py` — reads ABI from `contracts/out/` (Providers layer)
9. `adapters/circle_wallets.py` — agent wallet provisioning (Providers layer)
10. `llm/negotiation.py` — structured JSON + extended thinking (Service layer)
11. `llm/strategy.py` — structured JSON + extended thinking (Service layer)
12. `orchestrator.py` — wires all components, state-machine routing (Orchestrator layer)
13. `tests/evals/` — 20+ LLM eval scenarios before connecting to backend

---

## What Needs to Be Built

### 1. ML Underwriting Model
Answers: "If I accept this contract, how likely am I to achieve the target?"
- Inputs: target ROAS, spend floor, time window, historical ROAS baseline, campaign mode
- Outputs: `success_probability`, `risk_level`, `expected_roas_range`, `recommended_action`, `recommended_fee_usdc`
- Decision policy: >= 65% → accept, 35–64% → counteroffer, < 35% → reject
- Model type: Logistic Regression baseline, XGBoost/LightGBM preferred
- If no real data: generate a synthetic dataset with plausible distributions

### 2. LLM Negotiation Layer
Answers: "How do I explain this and what do I propose?"
- Receives ML underwriting output + original contract request
- Returns structured JSON: `offer_type`, `message`, `revised_threshold`, `revised_fee_usdc`, `revised_time_window_days`
- Use extended thinking (`thinking` parameter) — this is a complex reasoning step
- JSON schema validated before returning to orchestrator

### 3. LLM Strategy Generator
Answers: "What Meta Ads strategy should I run?"
- Receives approved contract terms + account context
- Returns structured JSON: `strategy_summary`, `actions[]`
- Output shown to merchant for approval before any action executes
- Use extended thinking

### 4. ML Live Outcome Forecast Model
Answers: "Given current progress, will I succeed by the deadline?"
- Inputs: current spend, revenue, ROAS, days elapsed, days remaining, target, spend floor
- Outputs: `predicted_final_roas`, `success_probability`, `status` (on_track / at_risk / off_track)
- Runs on every daily monitoring tick

### 5. Deterministic Resolution Engine
Answers: "Did the contracted outcome get achieved?"
- Pure logic: `spend >= min_spend AND final_roas >= target_roas AND window_complete`
- No ML. No LLM. This is what triggers USDC settlement.
- Output logged to audit logger before any settlement adapter is called

### 6. Meta Ads Adapter
- Read performance data, create campaigns, create ad sets, set budgets
- Mock adapter returns realistic day-by-day ROAS progression for demo

### 7. Arc Escrow Adapter
- Reads ABI and address from `contracts/out/abi.json` + `contracts/out/address.json`
- Calls `release()` on success, `refund()` on failure
- Returns Arc tx hash for every settlement action

### 8. Circle Wallets Integration
- Provisions agent wallet for receiving USDC on success
- Reports agent wallet balance for transparency

### 9. Audit Logger
- Queryable by contract_id, component, timestamp range
- Every component call logs inputs + outputs + timestamp
- The backbone for crash recovery and chat Q&A context
