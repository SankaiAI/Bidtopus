# AGENT.md — OutcomeX Agent Knowledge Base

This file is the table of contents (~100 lines). Read it first before touching any component file.
For deep context on any topic, follow the link to the relevant docs/ file.

---

## What This Agent Does

OutcomeX agent is an autonomous economic agent that:
1. Underwrites performance contracts (ML model)
2. Negotiates terms with merchants (LLM + structured JSON)
3. Executes Meta Ads strategies (adapter, merchant-approved)
4. Monitors campaign performance daily (ML forecast + background scheduler)
5. Settles USDC escrow deterministically (resolution engine + Arc adapter)

---

## Critical Rules — Never Violate

1. **LLM never makes the settlement call.** The deterministic resolution engine does. LLM may narrate the result but cannot change it.
2. **No ad execution without merchant approval.** Check `strategy_plans.approval_status = approved` in DB before calling any adapter.
3. **Log intent before execution.** Write to audit logger BEFORE calling any adapter. If the process crashes, the intent is already persisted.
4. **All LLM outputs are structured JSON.** Validate the schema before any action downstream.
5. **Routing is state-driven, not keyword-driven.** The contract's current state determines the next valid action. Never parse text to decide what to do.

→ Full rules with reasoning: [docs/safety-rules.md](docs/safety-rules.md)

---

## Component Map

| Component | File | What it answers |
|---|---|---|
| Orchestrator | `orchestrator.py` | What happens next, based on contract state |
| ML Underwriting | `ml/underwriting.py` | "If I accept, how likely am I to hit the target?" |
| LLM Negotiation | `llm/negotiation.py` | "How do I explain this and what do I offer?" |
| LLM Strategy | `llm/strategy.py` | "What Meta Ads plan should I run?" |
| ML Forecast | `ml/forecast.py` | "Given today's data, will I succeed by deadline?" |
| Resolution Engine | `engine/resolution.py` | "Did the merchant's target get achieved?" (pure logic) |
| Meta Ads Adapter | `adapters/meta_ads.py` | Campaign reads + execution (real + mock) |
| Arc Escrow Adapter | `adapters/arc_escrow.py` | USDC release/refund via Arc |
| Circle Wallets | `adapters/circle_wallets.py` | Agent wallet provisioning and balance |
| Audit Logger | `db/audit_logger.py` | Queryable history of every agent action |

---

## Three Interaction Modes — Never Mix Them

| Mode | Pattern | Triggered by |
|---|---|---|
| **Negotiation loop** | Sequential turns, each persisted to DB | Merchant submits contract |
| **Background scheduler** | APScheduler job, runs every 24h per Active contract | Contract status → Active |
| **Chat Q&A** | Read DB state, answer with Claude, no execution | Merchant sends a chat message |

The UI reads from DB. The scheduler writes to DB. They never share a loop.

→ Detail: [docs/negotiation.md](docs/negotiation.md), [docs/lifecycle.md](docs/lifecycle.md)

---

## Contract State Machine

```
Created → Underwriting → Offered → FundedPending → Funded → Active → Resolving → Settled
```

Each state has exactly one valid next action. The orchestrator checks state before every step.
→ Full lifecycle and valid transitions: [docs/lifecycle.md](docs/lifecycle.md)

---

## Decision Thresholds (all in `config.py` — never hardcode)

| Threshold | Default | Config key |
|---|---|---|
| Accept probability | >= 0.65 | `ACCEPT_THRESHOLD` |
| Counteroffer range | 0.35–0.64 | `COUNTER_LOW`, `COUNTER_HIGH` |
| Reject probability | < 0.35 | `REJECT_THRESHOLD` |
| Auto-approve budget shift | <= 15% change | `AUTO_APPROVE_BUDGET_PCT` |
| Require approval budget shift | > 30% change | `APPROVAL_REQUIRED_BUDGET_PCT` |

---

## Deep Docs

- [docs/lifecycle.md](docs/lifecycle.md) — State machine, contract lifecycle, valid transitions
- [docs/underwriting.md](docs/underwriting.md) — ML model inputs, outputs, training data, synthetic dataset
- [docs/negotiation.md](docs/negotiation.md) — Negotiation loop, offer types, fee logic, counteroffer rules
- [docs/safety-rules.md](docs/safety-rules.md) — Hard structural constraints, what the LLM cannot do
- [docs/meta-ads.md](docs/meta-ads.md) — Adapter actions, mock behavior, realistic progression data
- [docs/observability.md](docs/observability.md) — Dual-write design, audit logger schema, query patterns
- [docs/security.md](docs/security.md) — All 8 security rules with code examples and checklist
