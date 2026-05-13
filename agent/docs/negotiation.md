# Negotiation Loop — Design and Patterns

## Overview

The negotiation is a multi-turn conversation between the merchant and the agent. Each turn is a DB record. The loop exits when the agent reaches `accept` or `reject` — not on a timer, not at a fixed number of rounds.

---

## Turn Structure

Each negotiation turn is persisted to the `agent_offers` table before the next turn begins.

```
Turn 1: Merchant submits initial contract terms
Turn 2: Agent underwrites → generates offer (accept / counteroffer / reject)
Turn 3: If counteroffer → Merchant responds with revised terms or accepts
Turn 4: Agent re-underwrites revised terms → generates new offer
...
Terminal: Agent accepts or rejects → negotiation loop exits
```

---

## The Negotiation Loop in Code

```python
def negotiation_loop(contract_id: str):
    while True:
        state = db.get_contract_state(contract_id)

        # Checkpoint: save intent before computing
        audit_logger.log(contract_id, "llm_negotiation", "intent", {"state": state.model_dump()})

        # Underwrite current terms
        underwriting = underwriting_model.predict(state.contract_terms)
        audit_logger.log(contract_id, "ml_underwriting", "result", underwriting.model_dump())

        # Generate offer
        offer = negotiation_layer.generate_offer(underwriting, state.contract_terms)
        db.save_offer(contract_id, offer)
        audit_logger.log(contract_id, "llm_negotiation", "result", offer.model_dump())

        # Agent decides to exit
        if offer.offer_type in ("accept", "reject"):
            db.update_contract_status(contract_id, "Offered")
            break

        # Counteroffer: wait for merchant response (poll DB)
        merchant_turn = db.poll_merchant_response(contract_id, after=offer.created_at)
        if merchant_turn.accepted_as_is:
            db.update_contract_status(contract_id, "FundedPending")
            break

        # Merchant proposed new terms — loop with updated contract
        db.update_contract_terms(contract_id, merchant_turn.revised_terms)
```

---

## Three Offer Types

| `offer_type` | When to use | What the agent does |
|---|---|---|
| `accept` | `success_probability >= ACCEPT_THRESHOLD (0.65)` | Accepts as-is. Contract moves to FundedPending. |
| `counteroffer` | `COUNTER_LOW (0.35) <= probability < ACCEPT_THRESHOLD` | Proposes revised terms (lower ROAS target, longer window, or higher fee). |
| `reject` | `probability < REJECT_THRESHOLD (0.35)` | Declines. Optionally explains what terms would make it feasible. |

---

## LLM Output Schema (AgentOffer)

```python
class AgentOffer(BaseModel):
    offer_type:              Literal["accept", "counteroffer", "reject"]
    message:                 str          # plain-language explanation for merchant
    revised_threshold:       float | None # counteroffer: new ROAS target (e.g. 1.8)
    revised_fee_usdc:        float | None # counteroffer: new fee
    revised_time_window_days: int | None  # counteroffer: new window
```

All fields are required in the JSON response. `null` is valid for `revised_*` fields on `accept` and `reject`.

---

## Fee Recommendation Logic (pass to LLM as instructions)

The LLM must follow these fee-reasoning rules when generating a counteroffer:

- Higher target difficulty (ROAS 3.0 vs 2.0) → higher fee recommendation
- Lower success probability → higher fee OR rejection
- Longer time window → lower relative execution risk → lower fee adjustment
- Higher merchant budget/impact → higher value ceiling for agent fee

These rules live in the negotiation system prompt, not in config.py (they require reasoning, not thresholds).

---

## Extended Thinking for Negotiation

The negotiation step involves weighing tradeoffs: probability vs. fee vs. window length. Use Claude's `thinking` parameter here — it materially improves counteroffer quality.

```python
response = claude.messages.create(
    model="claude-sonnet-4-6",
    thinking={"type": "enabled", "budget_tokens": 5000},
    system=NEGOTIATION_SYSTEM_PROMPT,
    messages=[{
        "role": "user",
        "content": f"Underwriting result: {underwriting.model_dump_json()}\n"
                   f"Contract request: {contract_terms.model_dump_json()}"
    }]
)
```

The thinking content is not returned to the merchant — only `offer.message` is surfaced in the UI.

---

## Example Offers

**Accept:**
```json
{
  "offer_type": "accept",
  "message": "I estimate a 68% chance of achieving ROAS ≥ 2.0 within 7 days. I accept this contract for 100 USDC.",
  "revised_threshold": null,
  "revised_fee_usdc": null,
  "revised_time_window_days": null
}
```

**Counteroffer:**
```json
{
  "offer_type": "counteroffer",
  "message": "ROAS ≥ 3.0 carries only a 28% success probability with this account's baseline. I propose ROAS ≥ 2.0 for 100 USDC, or ROAS ≥ 3.0 with a 14-day window for 180 USDC.",
  "revised_threshold": 2.0,
  "revised_fee_usdc": 100,
  "revised_time_window_days": 7
}
```

**Reject:**
```json
{
  "offer_type": "reject",
  "message": "The requested ROAS ≥ 4.0 target has an estimated success probability below 15% given this account's 30-day baseline. I cannot responsibly accept this contract. A target of ROAS ≥ 2.2 would be achievable.",
  "revised_threshold": null,
  "revised_fee_usdc": null,
  "revised_time_window_days": null
}
```
