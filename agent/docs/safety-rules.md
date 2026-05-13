# Agent Safety Rules — Structural Constraints

These are not prompt instructions. They are enforced in code. The LLM cannot bypass them regardless of what it generates.

---

## Rule 1: LLM Output is Always Validated Before Any Action

Every LLM call returns structured JSON. That JSON is schema-validated before the orchestrator acts on it. Invalid JSON = logged error + safe fallback, never a crashed process.

```python
def generate_offer(underwriting_result: UnderwritingOutput) -> AgentOffer:
    raw = claude.messages.create(
        model="claude-sonnet-4-6",
        system=NEGOTIATION_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": underwriting_result.model_dump_json()}]
    )
    try:
        offer = AgentOffer.model_validate_json(raw.content[0].text)
    except ValidationError as e:
        audit_logger.log("llm_validation_error", {"error": str(e), "raw": raw.content[0].text})
        raise SafeAgentError("LLM output failed schema validation")
    return offer
```

---

## Rule 2: No Ad Execution Without Merchant Approval

Before calling any Meta Ads adapter action, the orchestrator checks the DB — not memory, not a passed flag.

```python
def execute_ads_actions(contract_id: str):
    strategy = repo.get_strategy_plan(contract_id)

    # This check runs in code, not in the LLM prompt
    if strategy is None or strategy.approval_status != "approved":
        raise SafeAgentError("Cannot execute ads: strategy not merchant-approved")

    audit_logger.log(contract_id, "intent", {"action": "execute_ads", "strategy_id": strategy.id})
    meta_ads_adapter.execute(strategy.planned_actions)
```

---

## Rule 3: The Resolution Engine is Never Delegated to the LLM

The deterministic resolution engine is pure Python logic. The LLM may narrate the result, but it never computes it and cannot change it.

```python
def resolve(contract_id: str) -> ResolutionResult:
    final = repo.get_latest_snapshot(contract_id)
    contract = repo.get_contract(contract_id)

    # This is all deterministic — no LLM call
    target_met  = final.roas >= contract.threshold
    spend_met   = final.spend >= contract.minimum_spend
    window_done = is_evaluation_window_complete(contract)

    outcome = "success" if (target_met and spend_met and window_done) else "failure"

    result = ResolutionResult(
        outcome=outcome,
        final_roas=final.roas,
        final_spend=final.spend,
        target_met=target_met,
        spend_met=spend_met,
    )
    audit_logger.log(contract_id, "resolution", result.model_dump())
    return result

# LLM narrates AFTER the result is computed and logged:
def narrate_resolution(result: ResolutionResult) -> str:
    return claude.messages.create(
        system="Explain this settlement result to the merchant in plain language.",
        messages=[{"role": "user", "content": result.model_dump_json()}]
    ).content[0].text
```

---

## Rule 4: Log Intent Before Execution

Every adapter call is preceded by an audit log entry. If the process crashes between the log and the execution, the intent is persisted. The orchestrator knows what was attempted.

```python
# Correct pattern — every adapter call
audit_logger.log(contract_id, "intent",   {"action": "release_escrow", "amount": amount})
result = arc_escrow_adapter.release(contract_id)
audit_logger.log(contract_id, "result",   {"tx_hash": result.tx_hash, "status": result.status})
```

---

## Rule 5: Settlement Only After Deterministic Resolution

The Arc escrow adapter can only be called after the resolution engine has run and its output is persisted.

```python
def trigger_settlement(contract_id: str):
    resolution = repo.get_resolution(contract_id)

    # Hard check — resolution must exist in DB
    if resolution is None:
        raise SafeAgentError("Cannot settle: no resolution record found")
    if resolution.outcome not in ("success", "failure"):
        raise SafeAgentError("Cannot settle: resolution outcome is not terminal")

    if resolution.outcome == "success":
        arc_escrow_adapter.release(contract_id)
    else:
        arc_escrow_adapter.refund(contract_id)
```

---

## Rule 6: Contract State Gate in Orchestrator

The orchestrator checks contract state before every step. No action executes on a contract in the wrong state.

```python
VALID_NEXT_ACTIONS = {
    "Created":       {"run_underwriting"},
    "Underwriting":  {"generate_offer"},
    "Offered":       {"await_merchant_response"},
    "FundedPending": {"confirm_escrow_funded"},
    "Funded":        {"generate_strategy"},
    "Active":        {"run_daily_monitoring", "execute_optimization"},
    "Resolving":     {"run_resolution_engine"},
}

def orchestrate(contract_id: str, requested_action: str):
    contract = repo.get_contract(contract_id)
    valid = VALID_NEXT_ACTIONS.get(contract.status, set())

    if requested_action not in valid:
        raise SafeAgentError(
            f"Action '{requested_action}' not valid for contract in state '{contract.status}'"
        )
    # proceed
```

---

## Summary Table

| Rule | Enforced by |
|---|---|
| LLM output validated | Pydantic schema validation in every LLM wrapper |
| No ads without approval | DB check in `execute_ads_actions()` |
| Resolution is deterministic | Resolution engine has no LLM imports |
| Log before execute | Explicit log call before every adapter call |
| Settlement after resolution | `repo.get_resolution()` check before escrow calls |
| State gate on every action | `VALID_NEXT_ACTIONS` map in orchestrator |
