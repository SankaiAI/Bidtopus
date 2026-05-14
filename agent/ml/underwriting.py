"""ML Contract Underwriting Model.

Answers: "If I accept this contract, how likely am I to achieve the target ROAS?"

Architecture:
  MVP: scikit-learn Pipeline (StandardScaler + LogisticRegression)
  Production upgrade path: swap clf for XGBoostClassifier with same interface

Training data:
  Hackathon: synthetic dataset generated at module load
  Production: real resolved contracts accumulated over time

Model persistence:
  Trained model is saved to MODEL_ARTIFACTS_DIR/underwriting_model.pkl.
  On restart, it loads from disk — no retraining needed.
"""
from __future__ import annotations

import math
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from config import settings
from models.types import AccountContext, ContractTerms, UnderwritingResult
from utils.logging import get_logger

logger = get_logger(__name__)

MODEL_VERSION = "1.0.0-synthetic"
FEATURES = [
    "historical_roas_7d",
    "historical_roas_30d",
    "avg_daily_spend",
    "requested_target_roas",
    "minimum_spend",
    "time_window_days",
    "campaign_type",
    "aov",
    "roas_gap",
]


# ── Synthetic dataset ─────────────────────────────────────────────────────────

def _generate_synthetic_dataset(n: int = 500, seed: int = 42) -> pd.DataFrame:
    rng = np.random.default_rng(seed)

    historical_roas_30d = rng.uniform(1.0, 4.0, n)
    requested_target_roas = historical_roas_30d + rng.uniform(-0.5, 2.0, n)
    time_window_days = rng.choice([7, 14, 30], n)
    avg_daily_spend = rng.uniform(50, 500, n)
    campaign_type = rng.choice([0, 1], n)   # 0=optimize, 1=new
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
        "time_window_days": time_window_days.astype(float),
        "campaign_type": campaign_type.astype(float),
        "aov": aov,
        "roas_gap": roas_gap,
        "success": success,
    })


def _train(df: pd.DataFrame) -> Pipeline:
    X = df[FEATURES]
    y = df["success"]
    pipeline = Pipeline([
        ("scaler", StandardScaler()),
        ("clf", LogisticRegression(max_iter=1000, random_state=42)),
    ])
    pipeline.fit(X, y)
    return pipeline


def _load_or_train() -> Pipeline:
    path = Path(settings.MODEL_ARTIFACTS_DIR) / "underwriting_model.pkl"
    if path.exists():
        logger.info("underwriting_model_loaded", path=str(path))
        return joblib.load(path)
    logger.info("underwriting_model_training", dataset="synthetic")
    df = _generate_synthetic_dataset()
    model = _train(df)
    path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, path)
    logger.info("underwriting_model_saved", path=str(path))
    return model


# ── Fee recommendation ────────────────────────────────────────────────────────

def _recommend_fee(success_probability: float, base_fee: float) -> float:
    if success_probability >= settings.ACCEPT_THRESHOLD:
        return round(base_fee, 2)
    elif success_probability >= 0.50:
        return round(base_fee * 1.25, 2)
    elif success_probability >= settings.COUNTER_LOW:
        return round(base_fee * 1.60, 2)
    else:
        return round(base_fee * 2.0, 2)


def _compute_roas_range(
    historical_roas_30d: float,
    success_probability: float,
    time_window_days: int,
) -> tuple[float, float]:
    spread = 0.6 * (1 - success_probability)
    time_factor = min(time_window_days / 30, 1.0)
    center = historical_roas_30d * (1 + 0.1 * time_factor)
    return (
        round(max(center - spread, 0.5), 2),
        round(center + spread, 2),
    )


def _risk_level(p: float) -> str:
    if p >= settings.ACCEPT_THRESHOLD:
        return "low"
    elif p >= settings.COUNTER_LOW:
        return "medium"
    return "high"


def _recommendation(p: float) -> str:
    if p >= settings.ACCEPT_THRESHOLD:
        return "accept"
    elif p >= settings.COUNTER_LOW:
        return "counteroffer"
    return "reject"


# ── Public interface ──────────────────────────────────────────────────────────

class UnderwritingModel:
    """Singleton-friendly — load once at startup, call predict() per contract."""

    def __init__(self) -> None:
        self._pipeline = _load_or_train()

    def predict(
        self,
        contract_terms: ContractTerms,
        account_context: AccountContext,
    ) -> UnderwritingResult:
        roas_30d = account_context.historical_roas_30d or 2.0
        roas_7d = account_context.historical_roas_7d or roas_30d
        avg_spend = account_context.avg_daily_spend or 100.0
        aov = account_context.aov or 0.0
        campaign_type_num = 1.0 if contract_terms.campaign_type == "new" else 0.0
        roas_gap = contract_terms.requested_target_roas - roas_30d

        features = pd.DataFrame([{
            "historical_roas_7d": roas_7d,
            "historical_roas_30d": roas_30d,
            "avg_daily_spend": avg_spend,
            "requested_target_roas": contract_terms.requested_target_roas,
            "minimum_spend": contract_terms.minimum_spend,
            "time_window_days": float(contract_terms.time_window_days),
            "campaign_type": campaign_type_num,
            "aov": aov,
            "roas_gap": roas_gap,
        }])

        prob = float(self._pipeline.predict_proba(features)[0][1])
        prob = round(math.fabs(prob), 4)

        return UnderwritingResult(
            success_probability=prob,
            risk_level=_risk_level(prob),
            expected_roas_range=_compute_roas_range(roas_30d, prob, contract_terms.time_window_days),
            recommendation=_recommendation(prob),
            recommended_fee_usdc=_recommend_fee(prob, contract_terms.success_fee_usdc),
        )

    def retrain(self, df: pd.DataFrame) -> None:
        """Retrain on new resolved contract data. Call when 20+ new outcomes arrive."""
        self._pipeline = _train(df)
        path = Path(settings.MODEL_ARTIFACTS_DIR) / "underwriting_model.pkl"
        joblib.dump(self._pipeline, path)
        logger.info("underwriting_model_retrained", rows=len(df))
