# Underwriting Model — Deep Docs

**Component:** `ml/underwriting.py`
**Called by:** `orchestrator.py` → `backend/agent_client.py` → `POST /api/contracts/:id/underwrite`

---

## Purpose

The underwriting model answers one question: **"If I accept this contract, how likely am I to achieve the merchant's target ROAS within the evaluation window?"**

The ML model produces the probability. The LLM negotiation layer (`llm/negotiation.py`) interprets and communicates it. These two steps are always separate — the ML number is never produced by the LLM.

---

## Input Features

| Feature | Type | Source | Notes |
|---|---|---|---|
| `historical_roas_7d` | float | Meta Ads adapter | Merchant's recent 7-day ROAS baseline |
| `historical_roas_30d` | float | Meta Ads adapter | 30-day ROAS baseline |
| `avg_daily_spend` | float | Meta Ads adapter | Average daily ad spend |
| `requested_target_roas` | float | Contract terms | The ROAS threshold merchant wants to hit |
| `minimum_spend` | float | Contract terms | Spend floor before resolution is valid |
| `time_window_days` | int | Contract terms | Evaluation window length |
| `campaign_type` | string | Contract terms | `"new"` or `"optimize"` |
| `aov` | float | account_context | Average order value — use 0.0 if unavailable |

**Derived feature (compute before passing to model):**

```python
roas_gap = requested_target_roas - historical_roas_30d
# Positive gap = merchant is asking for improvement above baseline
# Negative gap = target is below current performance (low risk)
```

---

## Output Schema

```python
class UnderwritingResult(BaseModel):
    success_probability: float          # 0.0 – 1.0
    risk_level: Literal["low", "medium", "high"]
    expected_roas_range: tuple[float, float]   # [min, max] predicted ROAS
    recommendation: Literal["accept", "counteroffer", "reject"]
    recommended_fee_usdc: float
```

Example output:
```json
{
  "success_probability": 0.68,
  "risk_level": "medium",
  "expected_roas_range": [1.7, 2.4],
  "recommendation": "accept",
  "recommended_fee_usdc": 100.0
}
```

---

## Decision Policy

Thresholds are in `config.py` — never hardcode them here.

| Probability | `risk_level` | `recommendation` |
|---|---|---|
| >= `ACCEPT_THRESHOLD` (0.65) | low | accept |
| `COUNTER_LOW` – `COUNTER_HIGH` (0.35 – 0.64) | medium | counteroffer |
| < `REJECT_THRESHOLD` (0.35) | high | reject |

### Fee Recommendation Logic

```python
def recommend_fee(success_probability: float, contract: ContractTerms) -> float:
    base_fee = contract.success_fee_usdc
    if success_probability >= 0.65:
        return base_fee                         # accept at merchant's proposed fee
    elif success_probability >= 0.50:
        return base_fee * 1.25                  # modest increase for medium-high risk
    elif success_probability >= 0.35:
        return base_fee * 1.60                  # significant increase for medium-low risk
    else:
        return base_fee * 2.0                   # reject territory — fee unlikely to close
```

Higher target difficulty, lower probability, and shorter time windows all push the fee up. Longer windows reduce relative execution risk and pull it down.

---

## Model Architecture

### MVP Baseline — Logistic Regression

```python
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

pipeline = Pipeline([
    ("scaler", StandardScaler()),
    ("clf", LogisticRegression(max_iter=1000, random_state=42)),
])
```

Use this for the hackathon. It trains in seconds on synthetic data and produces calibrated probabilities.

### Preferred — XGBoost or LightGBM

```python
import xgboost as xgb

model = xgb.XGBClassifier(
    n_estimators=100,
    max_depth=4,
    learning_rate=0.1,
    use_label_encoder=False,
    eval_metric="logloss",
    random_state=42,
)
```

Upgrade to this when real contract outcomes accumulate (50+ resolved contracts). Better handling of non-linear feature interactions (e.g. `roas_gap` × `time_window_days`).

---

## Synthetic Dataset (MVP)

No real historical data is available at launch. Generate a synthetic dataset that produces plausible, demo-ready outputs.

```python
import numpy as np
import pandas as pd

def generate_synthetic_dataset(n: int = 500, seed: int = 42) -> pd.DataFrame:
    rng = np.random.default_rng(seed)

    historical_roas_30d = rng.uniform(1.0, 4.0, n)
    requested_target_roas = historical_roas_30d + rng.uniform(-0.5, 2.0, n)
    time_window_days = rng.choice([7, 14, 30], n)
    avg_daily_spend = rng.uniform(50, 500, n)
    campaign_type = rng.choice([0, 1], n)        # 0=optimize, 1=new
    aov = rng.uniform(30, 300, n)
    minimum_spend = avg_daily_spend * rng.uniform(0.5, 1.5, n)

    roas_gap = requested_target_roas - historical_roas_30d
    success_prob_raw = (
        0.6
        - 0.25 * (roas_gap / historical_roas_30d).clip(0, 2)
        + 0.10 * (time_window_days / 30)
        - 0.10 * campaign_type
        + rng.normal(0, 0.1, n)
    ).clip(0.05, 0.95)

    success = (rng.uniform(0, 1, n) < success_prob_raw).astype(int)

    return pd.DataFrame({
        "historical_roas_7d": historical_roas_30d * rng.uniform(0.8, 1.2, n),
        "historical_roas_30d": historical_roas_30d,
        "avg_daily_spend": avg_daily_spend,
        "requested_target_roas": requested_target_roas,
        "minimum_spend": minimum_spend,
        "time_window_days": time_window_days,
        "campaign_type": campaign_type,
        "aov": aov,
        "roas_gap": roas_gap,
        "success": success,
    })
```

Train on this dataset at module load time. Persist the trained model to `ml/model_artifacts/underwriting_model.pkl` so it survives server restarts without retraining.

---

## Data Strategy

### Two-Tier Data Sharing (Post-Hackathon)

When real contract outcomes accumulate, the model improves via two separate data pools:

| Tier | What it contains | Used for |
|---|---|---|
| **Global pool** (opt-in) | Anonymized outcomes: ROAS range, success/failure, time window, vertical | Improving underwriting accuracy for all merchants |
| **Brand-specific** (default) | Full outcome + performance data for that merchant only | Improving that merchant's individual forecasts |

The merchant's data sharing preference (`data_sharing_opt_in`) is stored on the `users` table and checked before any outcome is added to the global pool.

**What goes in the global pool (anonymized):**
- ROAS range bucket (e.g. "1.5–2.0x"), not exact value
- Success/failure outcome
- Time window length
- Campaign type
- Industry vertical (if collected)

**What never leaves the brand-specific pool:**
- Exact spend amounts
- Exact revenue figures
- Audience targeting details
- Ad creative performance

### Retraining Frequency

Retraining is volume-triggered, not calendar-triggered.

| Stage | Trigger | Action |
|---|---|---|
| Hackathon | Synthetic data only | No retraining |
| Early (< 50 resolved contracts) | Manual, on-demand | Retrain when a batch of new outcomes is ready |
| Growth (50 – 500 contracts) | 20–30 new outcomes accumulated | Weekly automated retrain |
| Scale (500+ contracts) | Continuous | Daily or streaming updates |

Retraining on < 10 new outcomes adds noise, not signal. Wait for a meaningful batch.

---

## Integration with Negotiation Layer

The underwriting model's output is passed directly to `llm/negotiation.py` as structured input. The LLM never re-derives the probability — it interprets and communicates the ML output.

```python
# orchestrator.py
underwriting_result = underwriting_model.predict(contract_features)
offer = negotiation_layer.generate_offer(
    contract_terms=contract_terms,
    underwriting_result=underwriting_result,
)
```

The LLM receives `underwriting_result` in the `user` turn as structured JSON — never interpolated into the system prompt. See `docs/security.md` for the prompt injection rules.

---

## Expected ROAS Range

The `expected_roas_range` is computed from the model's predicted distribution, not the merchant's target:

```python
def compute_roas_range(
    historical_roas_30d: float,
    success_probability: float,
    time_window_days: int,
) -> tuple[float, float]:
    spread = 0.6 * (1 - success_probability)    # wider range = more uncertainty
    time_factor = min(time_window_days / 30, 1.0)
    center = historical_roas_30d * (1 + 0.1 * time_factor)
    return (
        round(max(center - spread, 0.5), 2),
        round(center + spread, 2),
    )
```

---

## Related Docs

- [negotiation.md](negotiation.md) — How the LLM uses this output to generate offers
- [safety-rules.md](safety-rules.md) — Why the LLM cannot change the probability
- [observability.md](observability.md) — How underwriting inputs/outputs are logged to `audit_events`
- [forecast.md](forecast.md) — The live forecast model that runs during Active contracts (separate model, same pattern)
