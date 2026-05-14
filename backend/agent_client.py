"""
Single HTTP boundary to the agent service.
All backend code calls through here — nothing else talks to the agent directly.
Request body is always { "contract_id": "<uuid>" }.
Returns plain dicts; the service layer owns persistence.
"""

from typing import Any

import httpx

from config import settings

_TIMEOUT = 120.0  # agent calls can be slow (LLM + Meta Ads API)


def _post(path: str, contract_id: str) -> dict[str, Any]:
    url = f"{settings.agent_base_url}{path}"
    resp = httpx.post(url, json={"contract_id": contract_id}, timeout=_TIMEOUT)
    resp.raise_for_status()
    return resp.json()


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


def generate_agent_offer(contract_id: str) -> dict[str, Any]:
    """
    LLM negotiation offer.
    Expected return shape:
    {
        "offer_type": "accept" | "counteroffer" | "reject",
        "message": str,
        "revised_threshold": float | None,
        "revised_fee_usdc": float | None,
        "revised_time_window_days": int | None,
    }
    """
    return _post("/agent/agent-offer", contract_id)


def generate_strategy(contract_id: str) -> dict[str, Any]:
    """
    Meta Ads strategy plan.
    Expected return shape:
    {
        "summary": str,
        "planned_actions": list[dict],
    }
    """
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
