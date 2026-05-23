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

    def execute_action(
        self, contract_id: str, action: StrategyAction, account_id: str
    ) -> dict[str, Any]:
        logger.info(
            "mock_action_executed",
            contract_id=contract_id,
            account_id=account_id,
            action_type=action.type,
            params=action.params,
        )
        return {
            "status": "success",
            "mock": True,
            "action_type": action.type,
            "account_id": account_id,
        }

    def get_account_context(self, account_id: str) -> dict[str, Any]:
        rng = random.Random(_seed_for(account_id))
        return {
            "meta_ads_account_id": account_id,
            "historical_roas_7d": round(1.2 + rng.uniform(0.3, 1.3), 2),
            "historical_roas_30d": round(1.1 + rng.uniform(0.3, 1.2), 2),
            "avg_daily_spend": round(50.0 + rng.uniform(0, 200), 2),
            "aov": round(30.0 + rng.uniform(10, 120), 2),
        }

    def get_live_campaign_context(self, account_id: str) -> dict[str, Any]:
        rng = random.Random(_seed_for(account_id))
        daily_spend = round(50.0 + rng.uniform(0, 200), 2)
        return {
            "campaigns": [
                {
                    "id": f"mock_campaign_{account_id[-4:]}",
                    "name": "Retargeting — Warm Audiences",
                    "status": "ACTIVE",
                    "objective": "OUTCOME_SALES",
                    "daily_budget_usd": round(daily_spend * 0.6, 2),
                }
            ],
            "ad_sets": [
                {
                    "id": f"mock_adset_{account_id[-4:]}_1",
                    "name": "Lookalike 1% — Purchasers",
                    "status": "ACTIVE",
                    "daily_budget_usd": round(daily_spend * 0.4, 2),
                    "targeting": "Lookalike 1% based on purchasers",
                },
                {
                    "id": f"mock_adset_{account_id[-4:]}_2",
                    "name": "Website Visitors — 30d",
                    "status": "ACTIVE",
                    "daily_budget_usd": round(daily_spend * 0.2, 2),
                    "targeting": "Website visitors in last 30 days",
                },
            ],
            "insights": {
                "impressions": int(daily_spend * rng.uniform(80, 120)),
                "clicks": int(daily_spend * rng.uniform(1, 3)),
                "spend": daily_spend,
                "roas": round(1.2 + rng.uniform(0.0, 1.0), 2),
                "ctr": round(rng.uniform(0.01, 0.03), 4),
                "cpc": round(rng.uniform(0.3, 1.5), 2),
            },
            "creatives": [
                {
                    "id": f"mock_creative_{account_id[-4:]}",
                    "name": "Product carousel — hero SKUs",
                    "format": "CAROUSEL",
                }
            ],
        }


# ── Real adapter — Meta Ads MCP at https://mcp.facebook.com/ads ───────────────
#
# Active MCP server: https://mcp.facebook.com/ads  (Meta's official server)
# Tool name convention: unprefixed (e.g. "create_campaign", not "mcp_meta_ads_create_campaign").
# The community Pipeboard server (https://mcp.pipeboard.co/meta-ads-mcp) uses the
# "mcp_meta_ads_*" prefix — do NOT use that server URL or prefix here.

# Maps StrategyAction.type values to their MCP tool names
_ACTION_MCP_TOOL: dict[str, str] = {
    "create_campaign":    "create_campaign",
    "create_ad_set":      "create_adset",
    "create_ad_creative": "create_ad_creative",
    "create_ad":          "create_ad",
    "set_budget":         "set_budget",
    "update_targeting":   "update_targeting",
    "pause_ad_set":       "pause_adset",
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

    def execute_action(
        self, contract_id: str, action: StrategyAction, account_id: str
    ) -> dict[str, Any]:
        return _run_sync(self._execute_action_async(contract_id, action, account_id))

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
        self, contract_id: str, action: StrategyAction, account_id: str
    ) -> dict[str, Any]:
        tool = _ACTION_MCP_TOOL[action.type]
        async with streamablehttp_client(self._MCP_URL, headers=self._headers) as (read, write, _):
            async with ClientSession(read, write) as session:
                await session.initialize()
                result = await session.call_tool(
                    tool,
                    {"contract_id": contract_id, "account_id": account_id, **action.params},
                )
                if result.isError:
                    raise MetaAdsError(f"MCP {tool} error: {_extract_text(result)}")
                raw = _extract_text(result)
        logger.info(
            "mcp_action_executed",
            contract_id=contract_id,
            account_id=account_id,
            action_type=action.type,
            mcp_tool=tool,
        )
        return {"status": "success", "action_type": action.type, "result": raw}

    def get_account_context(self, account_id: str) -> dict[str, Any]:
        return _run_sync(self._get_account_context_async(account_id))

    def get_live_campaign_context(self, account_id: str) -> dict[str, Any]:
        return _run_sync(self._get_live_campaign_context_async(account_id))

    async def _get_live_campaign_context_async(self, account_id: str) -> dict[str, Any]:
        async with streamablehttp_client(self._MCP_URL, headers=self._headers) as (read, write, _):
            async with ClientSession(read, write) as session:
                await session.initialize()

                campaigns_result = await session.call_tool("get_campaigns", {"account_id": account_id})
                ad_sets_result = await session.call_tool("get_adsets", {"account_id": account_id})
                insights_result = await session.call_tool(
                    "get_insights", {"account_id": account_id, "date_preset": "last_7d"}
                )
                creatives_result = await session.call_tool("get_ad_creatives", {"account_id": account_id})

        def _parse(result: Any) -> Any:
            if result.isError:
                return None
            raw = _extract_text(result)
            try:
                return json.loads(raw)
            except (ValueError, TypeError):
                return None

        context = {
            "campaigns": _parse(campaigns_result),
            "ad_sets": _parse(ad_sets_result),
            "insights": _parse(insights_result),
            "creatives": _parse(creatives_result),
        }
        logger.info("mcp_live_campaign_context_fetched", account_id=account_id)
        return context

    async def _get_account_context_async(self, account_id: str) -> dict[str, Any]:
        async with streamablehttp_client(self._MCP_URL, headers=self._headers) as (read, write, _):
            async with ClientSession(read, write) as session:
                await session.initialize()
                result = await session.call_tool(
                    "get_account_context",
                    {"account_id": account_id},
                )
                if result.isError:
                    raise MetaAdsError(f"MCP get_account_context error: {_extract_text(result)}")
                raw = _extract_text(result)
        data = json.loads(raw)
        logger.info("mcp_account_context_fetched", account_id=account_id)
        return {
            "meta_ads_account_id": account_id,
            "historical_roas_7d": data.get("historical_roas_7d"),
            "historical_roas_30d": data.get("historical_roas_30d"),
            "avg_daily_spend": data.get("avg_daily_spend"),
            "aov": data.get("aov"),
        }


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


def get_meta_ads_adapter(access_token: str | None = None) -> MetaAdsAdapterBase:
    """Return the appropriate Meta Ads adapter.

    In mock mode the token is ignored — mock adapters don't make real MCP calls.
    In real mode, `access_token` takes priority over the env var so each request can
    use the merchant's own OAuth token instead of a shared static credential.
    """
    if settings.META_ADS_MOCK:
        return MockMetaAdsAdapter()
    token = access_token or settings.META_ADS_ACCESS_TOKEN
    if not token:
        raise MetaAdsError(
            "No Meta Ads access token available. "
            "Pass access_token in the request or set META_ADS_ACCESS_TOKEN in env."
        )
    return RealMetaAdsAdapter(access_token=token)
