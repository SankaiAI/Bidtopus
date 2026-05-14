"""Meta Ads Adapter — real + mock implementations.

The mock returns realistic day-by-day ROAS progression so the monitoring
dashboard tells a coherent story during demo. Performance follows a three-phase
curve: learning (days 1-2), ramp (days 3-5), plateau/success (days 6+).

Usage:
    adapter = get_meta_ads_adapter()   # returns mock or real based on META_ADS_MOCK flag
    snapshot = adapter.get_performance(contract_id, day=3)
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import random
from datetime import datetime
from typing import Any

from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client

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


# ── Real adapter — Meta Ads MCP at https://mcp.facebook.com/ads ───────────────

# Maps StrategyAction.type values to their MCP tool names
_ACTION_MCP_TOOL: dict[str, str] = {
    "create_campaign":  "create_campaign",
    "create_ad_set":    "create_ad_set",
    "set_budget":       "set_budget",
    "update_targeting": "update_targeting",
    "pause_ad_set":     "pause_ad_set",
}


class RealMetaAdsAdapter(MetaAdsAdapterBase):
    """Production adapter. Connects to the Meta Ads MCP server at https://mcp.facebook.com/ads.

    Requires META_ADS_ACCESS_TOKEN — a Meta user access token with ads_management and
    ads_read permissions. See README.md § Meta Ads MCP Authentication for setup details.
    Set META_ADS_MOCK=False to activate this adapter.
    """

    _MCP_URL = "https://mcp.facebook.com/ads"

    def __init__(self, access_token: str) -> None:
        self._headers = {"Authorization": f"Bearer {access_token}"}

    def get_performance(self, contract_id: str, day: int) -> PerformanceSnapshot:
        return _run_sync(self._get_performance_async(contract_id, day))

    def execute_action(self, contract_id: str, action: StrategyAction) -> dict[str, Any]:
        return _run_sync(self._execute_action_async(contract_id, action))

    # ── Async MCP internals ───────────────────────────────────────────────────

    async def _get_performance_async(self, contract_id: str, day: int) -> PerformanceSnapshot:
        async with streamablehttp_client(self._MCP_URL, headers=self._headers) as (read, write, _):
            async with ClientSession(read, write) as session:
                await session.initialize()
                result = await session.call_tool(
                    "get_campaign_performance",
                    {"contract_id": contract_id, "day": day},
                )
                if result.isError:
                    raise MetaAdsError(f"MCP get_campaign_performance error: {_extract_text(result)}")
                raw = _extract_text(result)
        data = json.loads(raw)
        snapshot = PerformanceSnapshot(
            spend=data["spend"],
            revenue=data["revenue"],
            roas=data["roas"],
            impressions=data.get("impressions", 0),
            clicks=data.get("clicks", 0),
            day=day,
            timestamp=datetime.utcnow(),
        )
        logger.info(
            "mcp_performance_fetched",
            contract_id=contract_id,
            day=day,
            roas=snapshot.roas,
        )
        return snapshot

    async def _execute_action_async(
        self, contract_id: str, action: StrategyAction
    ) -> dict[str, Any]:
        tool = _ACTION_MCP_TOOL[action.type]
        async with streamablehttp_client(self._MCP_URL, headers=self._headers) as (read, write, _):
            async with ClientSession(read, write) as session:
                await session.initialize()
                result = await session.call_tool(
                    tool,
                    {"contract_id": contract_id, **action.params},
                )
                if result.isError:
                    raise MetaAdsError(f"MCP {tool} error: {_extract_text(result)}")
                raw = _extract_text(result)
        logger.info(
            "mcp_action_executed",
            contract_id=contract_id,
            action_type=action.type,
            mcp_tool=tool,
        )
        return {"status": "success", "action_type": action.type, "result": raw}


# ── Module-level helpers ──────────────────────────────────────────────────────

def _extract_text(result: Any) -> str:
    """Return the first text block from an MCP CallToolResult."""
    for block in result.content:
        if hasattr(block, "text"):
            return block.text
    return ""


def _run_sync(coro: Any) -> Any:
    """Run an async coroutine on a fresh event loop (safe in any calling context)."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


# ── Factory ───────────────────────────────────────────────────────────────────

# Type alias exposed publicly
MetaAdsAdapter = MetaAdsAdapterBase


def get_meta_ads_adapter() -> MetaAdsAdapterBase:
    if settings.META_ADS_MOCK:
        return MockMetaAdsAdapter()
    if not settings.META_ADS_ACCESS_TOKEN:
        raise MetaAdsError("META_ADS_ACCESS_TOKEN is required when META_ADS_MOCK=False")
    return RealMetaAdsAdapter(access_token=settings.META_ADS_ACCESS_TOKEN)
