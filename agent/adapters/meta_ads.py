"""Meta Ads Adapter — real + mock implementations.

The mock returns realistic day-by-day ROAS progression so the monitoring
dashboard tells a coherent story during demo. Performance follows a three-phase
curve: learning (days 1-2), ramp (days 3-5), plateau/success (days 6+).

Usage:
    adapter = get_meta_ads_adapter()   # returns mock or real based on META_ADS_MOCK flag
    snapshot = adapter.get_performance(contract_id, day=3)
"""
from __future__ import annotations

import hashlib
import random
from datetime import datetime
from typing import Any

import httpx

from config import settings
from exceptions import MetaAdsError
from models.types import PerformanceSnapshot, StrategyAction
from utils.logging import get_logger
from adapters.base import MetaAdsAdapterBase

logger = get_logger(__name__)


# ── Mock adapter ──────────────────────────────────────────────────────────────

# Day-by-day ROAS multipliers relative to baseline (7-day contract)
_ROAS_CURVE_7D = [0.75, 0.85, 0.95, 1.05, 1.10, 1.12, 1.15]
# 14-day contract curve
_ROAS_CURVE_14D = [
    0.65, 0.75, 0.82, 0.90, 0.95, 1.00, 1.03,
    1.06, 1.08, 1.10, 1.11, 1.12, 1.13, 1.14,
]


def _seed_for(contract_id: str) -> int:
    """Deterministic seed so the same contract always gets the same mock data."""
    return int(hashlib.md5(contract_id.encode()).hexdigest()[:8], 16)


class MockMetaAdsAdapter(MetaAdsAdapterBase):
    """Returns realistic progression data. Deterministic per contract_id."""

    def get_performance(self, contract_id: str, day: int) -> PerformanceSnapshot:
        rng = random.Random(_seed_for(contract_id) + day)
        baseline_roas = 1.8 + rng.uniform(-0.3, 0.5)
        daily_spend = 80 + rng.uniform(-10, 20)

        curve = _ROAS_CURVE_7D if day <= 7 else _ROAS_CURVE_14D
        idx = min(day - 1, len(curve) - 1) if day > 0 else 0
        daily_roas = baseline_roas * curve[idx] * rng.uniform(0.95, 1.05)

        revenue = daily_spend * daily_roas
        impressions = int(daily_spend * rng.uniform(80, 120))
        clicks = int(impressions * rng.uniform(0.01, 0.03))

        snapshot = PerformanceSnapshot(
            spend=round(daily_spend, 2),
            revenue=round(revenue, 2),
            roas=round(daily_roas, 3),
            impressions=impressions,
            clicks=clicks,
            day=day,
            timestamp=datetime.utcnow(),
        )
        logger.info(
            "mock_performance_fetched",
            contract_id=contract_id,
            day=day,
            roas=snapshot.roas,
        )
        return snapshot

    def execute_action(self, contract_id: str, action: StrategyAction) -> dict[str, Any]:
        logger.info(
            "mock_action_executed",
            contract_id=contract_id,
            action_type=action.type,
            params=action.params,
        )
        return {"status": "success", "mock": True, "action_type": action.type}


# ── Real adapter (stub — wire real Meta Ads MCP when credentials are available) ──

class RealMetaAdsAdapter(MetaAdsAdapterBase):
    """Production adapter. Requires META_ADS_ACCESS_TOKEN in env."""

    def __init__(self, access_token: str, base_url: str = "https://graph.facebook.com/v19.0") -> None:
        self._client = httpx.Client(
            base_url=base_url,
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=30.0,
        )

    def get_performance(self, contract_id: str, day: int) -> PerformanceSnapshot:
        raise NotImplementedError("Wire real Meta Ads API when credentials are available")

    def execute_action(self, contract_id: str, action: StrategyAction) -> dict[str, Any]:
        raise NotImplementedError("Wire real Meta Ads API when credentials are available")


# ── Factory ───────────────────────────────────────────────────────────────────

# Type alias exposed publicly
MetaAdsAdapter = MetaAdsAdapterBase


def get_meta_ads_adapter() -> MetaAdsAdapterBase:
    if settings.META_ADS_MOCK:
        return MockMetaAdsAdapter()
    access_token = getattr(settings, "META_ADS_ACCESS_TOKEN", "")
    if not access_token:
        raise MetaAdsError("META_ADS_ACCESS_TOKEN is required when META_ADS_MOCK=False")
    return RealMetaAdsAdapter(access_token=access_token)
