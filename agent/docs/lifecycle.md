# Agent Lifecycle — State Machine and Valid Transitions

## Contract State Machine

```
Created → Underwriting → Offered → FundedPending → Funded → Active → Resolving → Settled
```

### State Definitions

| State | Meaning | Next valid action |
|---|---|---|
| `Created` | Contract submitted by merchant | `run_underwriting` |
| `Underwriting` | ML model running | `generate_offer` |
| `Offered` | Agent offer sent to merchant | `await_merchant_response` (loop if counteroffer) |
| `FundedPending` | Merchant accepted, escrow not yet confirmed | `confirm_escrow_funded` |
| `Funded` | USDC locked in Arc escrow | `generate_strategy` |
| `Active` | Campaign running, daily monitoring loop | `run_daily_monitoring`, `execute_optimization` |
| `Resolving` | Evaluation window closed, resolving | `run_resolution_engine` |
| `Settled` | USDC released or refunded, contract closed | none |

The orchestrator checks `contract.status` before every action. Wrong state → hard stop, no action taken.

---

## Negotiation Loop

The negotiation loop runs until the contract reaches a terminal negotiation state (accept or reject). The agent decides when to exit — not the frontend, not a timer.

```
Merchant submits contract
        ↓
  run_underwriting()
        ↓
  generate_offer()
        ↓
  offer.type == "accept"? ──→ YES → status = FundedPending, exit loop
        ↓ NO
  offer.type == "reject"? ──→ YES → status = Rejected, exit loop
        ↓ NO (counteroffer)
  send counteroffer to merchant
        ↓
  await merchant response (poll DB)
        ↓
  merchant accepts? ──→ YES → status = FundedPending, exit loop
        ↓ NO (merchant proposes new terms)
  re-run underwriting with new terms
        ↓
  (loop back to generate_offer)
```

Each turn is persisted to `agent_offers` table before the loop continues. If the process crashes mid-negotiation, the last offer is in the DB — the orchestrator reads it on restart to determine where to resume.

---

## Monitoring Loop (Active State)

Runs daily via APScheduler for every contract in `Active` status. The agent decides when the contract is resolved.

```
Contract status = Active
        ↓
  BEFORE snapshot: get_performance()
        ↓
  log snapshot to audit_logger
        ↓
  run forecast model
        ↓
  needs optimization? ──→ YES → log intent → execute → log result
        ↓
  evaluation window closed? ──→ YES → run_resolution_engine() → break
        ↓ NO
  sleep 24h
        ↓
  (loop back to BEFORE snapshot)
```

---

## Background Scheduler Setup

```python
from apscheduler.schedulers.background import BackgroundScheduler

scheduler = BackgroundScheduler()

@scheduler.scheduled_job("interval", hours=24)
def run_active_contracts():
    active_contracts = repo.get_by_status("Active")
    for contract in active_contracts:
        monitoring_loop(contract.id)

scheduler.start()
```

The scheduler runs independently of any API request. The frontend polls `GET /contracts/:id/performance` to read the snapshots the scheduler writes.

---

## Crash Recovery

Because every action is logged to `audit_logger` before execution, the orchestrator can always determine where to resume:

```python
def resume_contract(contract_id: str):
    last_intent = audit_logger.get_latest_by_type(contract_id, "intent")
    contract = db.get_contract(contract_id)

    if contract.status == "Active":
        # Resume monitoring from last snapshot
        monitoring_loop(contract_id)
    elif contract.status == "Offered":
        # Resume negotiation — last offer already in DB
        await_merchant_response(contract_id)
    elif contract.status == "Resolving":
        # Re-run resolution (deterministic, safe to re-run)
        resolution_engine.resolve(contract_id)
```
