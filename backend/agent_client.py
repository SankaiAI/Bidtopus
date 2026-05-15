"""
Single HTTP boundary to the agent service.
All backend code calls through here — nothing else talks to the agent directly.
Request body is always { "contract_id": "<uuid>" }.
Returns plain dicts; the service layer owns persistence.
"""

import json
from collections.abc import Callable
from typing import Any

import httpx

from config import settings

_TIMEOUT = 120.0  # agent calls can be slow (LLM + Meta Ads API)


def _post(path: str, contract_id: str) -> dict[str, Any]:
    url = f"{settings.agent_base_url}{path}"
    resp = httpx.post(url, json={"contract_id": contract_id}, timeout=_TIMEOUT)
    resp.raise_for_status()
    return resp.json()


def _get(path: str, **params) -> dict[str, Any]:
    url = f"{settings.agent_base_url}{path}"
    resp = httpx.get(url, params=params, timeout=_TIMEOUT)
    resp.raise_for_status()
    return resp.json()


def _stream_sse(path: str, contract_id: str, on_reasoning: Callable[[str], None]) -> dict[str, Any]:
    """Call a /stream SSE endpoint, invoke on_reasoning for each reasoning_delta, return the result dict."""
    url = f"{settings.agent_base_url}{path}"
    result: dict[str, Any] = {}
    current_event: str | None = None
    with httpx.stream("POST", url, json={"contract_id": contract_id}, timeout=_TIMEOUT) as resp:
        resp.raise_for_status()
        for line in resp.iter_lines():
            if line.startswith("event: "):
                current_event = line[7:].strip()
            elif line.startswith("data: "):
                try:
                    data = json.loads(line[6:])
                except Exception:
                    data = {}
                if current_event == "reasoning_delta":
                    on_reasoning(data.get("text", ""))
                elif current_event == "result":
                    result = data
                elif current_event == "error":
                    raise RuntimeError(data.get("detail", "agent stream error"))
                current_event = None
    return result


def run_underwriting(contract_id: str) -> dict[str, Any]:
    """
    ML underwriting model.
    Expected return shape:
    {
        "success_probability": float,
        "risk_level": "low" | "medium" | "high",
        "expected_roas_range": [float, float],
        "recommendation": "accept" | "counteroffer" | "reject",
        "recommended_fee_usdc": float,
    }
    """
    return _post("/agent/underwrite", contract_id)


def generate_agent_offer(contract_id: str, on_reasoning: Callable[[str], None] | None = None) -> dict[str, Any]:
    """
    LLM negotiation offer.
    Pass on_reasoning to stream reasoning tokens via /agent/agent-offer/stream.
    Expected return shape:
    {
        "offer_type": "accept" | "counteroffer" | "reject",
        "message": str,
        "revised_threshold": float | None,
        "revised_fee_usdc": float | None,
        "revised_time_window_days": int | None,
    }
    """
    if on_reasoning is not None:
        return _stream_sse("/agent/agent-offer/stream", contract_id, on_reasoning)
    return _post("/agent/agent-offer", contract_id)


def generate_strategy(contract_id: str, on_reasoning: Callable[[str], None] | None = None) -> dict[str, Any]:
    """
    Meta Ads strategy plan.
    Pass on_reasoning to stream reasoning tokens via /agent/generate-strategy/stream.
    Expected return shape:
    {
        "summary": str,
        "planned_actions": list[dict],
    }
    """
    if on_reasoning is not None:
        return _stream_sse("/agent/generate-strategy/stream", contract_id, on_reasoning)
    return _post("/agent/generate-strategy", contract_id)


def execute_ads_actions(contract_id: str) -> dict[str, Any]:
    """
    Execute approved Meta Ads actions.
    Expected return shape:
    {
        "summary": str,
        "actions_executed": list[dict],
    }
    """
    return _post("/agent/execute-ads", contract_id)


def resolve_contract(contract_id: str) -> dict[str, Any]:
    """
    Deterministic resolution + on-chain settlement.
    Expected return shape:
    {
        "final_spend": float,
        "final_revenue": float,
        "final_roas": float,
        "outcome": "success" | "failure",
        "settlement_tx_hash": str | None,
    }
    """
    return _post("/agent/resolve", contract_id)


def get_account_context(meta_ads_account_id: str) -> dict[str, Any]:
    """
    Fetch historical Meta Ads performance context for ML underwriting.
    Always returns 200 — falls back to all-null fields if account is unknown.
    Expected return shape:
    {
        "historical_roas_7d": float | None,
        "historical_roas_30d": float | None,
        "avg_daily_spend": float | None,
        "aov": float | None,
        "meta_ads_account_id": str,
    }
    """
    return _get("/agent/account-context", meta_ads_account_id=meta_ads_account_id)


def activate_contract(contract_id: str) -> dict[str, Any]:
    """
    Register the 24h monitoring job in the agent's APScheduler.
    Call this immediately after a contract transitions to Active.
    Idempotent — safe to call even if already registered.
    Expected return shape:
    {
        "contract_id": str,
        "monitoring_scheduled": true,
    }
    """
    return _post("/agent/activate", contract_id)
