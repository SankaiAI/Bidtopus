# Observability — Dual-Write Design

The agent writes to two separate stores on every notable action. Never conflate them.

| Store | Table | Purpose | Read by |
|---|---|---|---|
| **Audit logger** | `audit_events` | Every component call — ML inputs/outputs, LLM decisions, adapter calls, crash recovery checkpoints | Agent orchestrator, developers |
| **Message store** | `contract_messages` | Only what the merchant sees — chat bubbles, daily updates, approval cards | Frontend timeline, SSE stream |

```python
# Pattern for every agent action that produces a visible UI event:

# 1. Internal record (always)
audit_logger.log(contract_id, "llm_negotiation", "result", offer.model_dump())

# 2. UI record (only when the merchant should see something)
messages_repo.append(
    contract_id, role="agent", type="message",
    content=offer.message,
    metadata={"offer_type": offer.offer_type}
)
```

From OpenAI's engineering lessons: "An agent that can't see its own history can't reason about it."
The audit logger is not write-only. It is the agent's queryable memory for crash recovery, chat Q&A, and debugging.

---

## Audit Events Table Schema

```sql
CREATE TABLE audit_events (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id  UUID         NOT NULL REFERENCES performance_contracts(id),
    component    VARCHAR(50)  NOT NULL,   -- "ml_underwriting" | "llm_negotiation" | "meta_ads" | "arc_escrow" | "resolution"
    event_type   VARCHAR(50)  NOT NULL,   -- "intent" | "result" | "snapshot" | "error"
    payload      JSONB        NOT NULL,   -- full inputs + outputs at this moment
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Indexes for query patterns the agent uses
CREATE INDEX idx_audit_contract_id   ON audit_events(contract_id);
CREATE INDEX idx_audit_component     ON audit_events(contract_id, component);
CREATE INDEX idx_audit_event_type    ON audit_events(contract_id, event_type);
CREATE INDEX idx_audit_created_at    ON audit_events(contract_id, created_at DESC);
```

---

## Query Patterns

### Chat Q&A — "How are we tracking?"
```python
def get_for_chat_context(contract_id: str, days_ago: int = 3) -> list[AuditEvent]:
    cutoff = datetime.utcnow() - timedelta(days=days_ago)
    return db.query(AuditEvent).filter(
        AuditEvent.contract_id == contract_id,
        AuditEvent.created_at >= cutoff
    ).order_by(AuditEvent.created_at.desc()).limit(50).all()
```

### Crash Recovery — "Where did we stop?"
```python
def get_latest_intent(contract_id: str) -> AuditEvent | None:
    return db.query(AuditEvent).filter(
        AuditEvent.contract_id == contract_id,
        AuditEvent.event_type == "intent"
    ).order_by(AuditEvent.created_at.desc()).first()
```

### Monitoring — "What's the latest performance snapshot?"
```python
def get_latest_snapshot(contract_id: str) -> dict | None:
    event = db.query(AuditEvent).filter(
        AuditEvent.contract_id == contract_id,
        AuditEvent.component == "meta_ads",
        AuditEvent.event_type == "snapshot"
    ).order_by(AuditEvent.created_at.desc()).first()
    return event.payload if event else None
```

### Debug — "What did the LLM decide on each turn?"
```python
def get_llm_decisions(contract_id: str) -> list[AuditEvent]:
    return db.query(AuditEvent).filter(
        AuditEvent.contract_id == contract_id,
        AuditEvent.component.in_(["llm_negotiation", "llm_strategy"])
    ).order_by(AuditEvent.created_at).all()
```

---

## What to Log at Each Component

### ML Underwriting
```python
audit_logger.log(contract_id, "ml_underwriting", "result", {
    "inputs":  underwriting_inputs.model_dump(),
    "outputs": underwriting_result.model_dump(),
    "model_version": MODEL_VERSION
})
```

### LLM Negotiation (log BEFORE and AFTER validation)
```python
audit_logger.log(contract_id, "llm_negotiation", "intent", {
    "prompt_inputs": {"underwriting": result.model_dump()}
})
audit_logger.log(contract_id, "llm_negotiation", "result", {
    "offer_type": offer.offer_type,
    "message":    offer.message,
    "revised_terms": offer.revised_terms()
})
```

### Meta Ads Adapter (log intent BEFORE calling the adapter)
```python
audit_logger.log(contract_id, "meta_ads", "intent",   {"action": action_type, "params": params})
result = meta_ads_adapter.execute(action_type, params)
audit_logger.log(contract_id, "meta_ads", "result",   {"success": True, "response": result})
```

### Daily Performance Snapshot
```python
audit_logger.log(contract_id, "meta_ads", "snapshot", {
    "spend":               snapshot.spend,
    "revenue":             snapshot.revenue,
    "roas":                snapshot.roas,
    "success_probability": forecast.success_probability,
    "forecast_status":     forecast.status,
    "day":                 days_elapsed
})
```

### Resolution Engine
```python
audit_logger.log(contract_id, "resolution", "result", {
    "outcome":      resolution.outcome,
    "final_roas":   resolution.final_roas,
    "final_spend":  resolution.final_spend,
    "target_met":   resolution.target_met,
    "spend_met":    resolution.spend_met,
    "inputs":       resolution_inputs.model_dump()
})
```

### Arc Escrow Settlement
```python
audit_logger.log(contract_id, "arc_escrow", "intent", {"action": "release", "amount": amount})
result = arc_escrow_adapter.release(contract_id)
audit_logger.log(contract_id, "arc_escrow", "result", {"tx_hash": result.tx_hash, "status": "confirmed"})
```

---

## Before/After Snapshot Pattern (Monitoring Loop)

For every optimization action, capture a BEFORE and AFTER snapshot and log the delta. This creates an evidence trail of what the agent did and whether it worked.

```python
def execute_and_verify(contract_id: str, action: OptimizationAction):
    # BEFORE
    before = meta_ads_adapter.get_performance(contract_id)
    audit_logger.log(contract_id, "meta_ads", "snapshot_before", before)

    # EXECUTE
    audit_logger.log(contract_id, "meta_ads", "intent", action.model_dump())
    meta_ads_adapter.execute(action)
    audit_logger.log(contract_id, "meta_ads", "executed", action.model_dump())

    # AFTER (next day's data)
    # The next scheduled monitoring tick captures the AFTER snapshot automatically
    # by comparing to the previous snapshot stored in audit_events
```

---

## AuditLogger Class Interface

```python
class AuditLogger:
    def log(self, contract_id: str, component: str, event_type: str, payload: dict) -> None: ...

    def get_all(self, contract_id: str) -> list[AuditEvent]: ...
    def get_latest_intent(self, contract_id: str) -> AuditEvent | None: ...
    def get_latest_snapshot(self, contract_id: str) -> dict | None: ...
    def get_by_component(self, contract_id: str, component: str) -> list[AuditEvent]: ...
    def get_since(self, contract_id: str, days_ago: int) -> list[AuditEvent]: ...
    def get_for_contract_summary(self, contract_id: str) -> list[AuditEvent]: ...
```
