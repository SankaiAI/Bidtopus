"""
Single HTTP boundary to the agent service.
All backend code calls through here — nothing else talks to the agent directly.
Request body is always { "contract_id": "<uuid>" }.
Returns plain dicts; the service layer owns persistence.
"""

import json
import logging
from collections.abc import Callable
from typing import Any

import httpx

from config import settings

_TIMEOUT = 120.0  # agent calls can be slow (LLM + Meta Ads API)
log = logging.getLogger(__name__)


def _service_headers() -> dict[str, str]:
    """Headers for backend→agent service-to-service calls (issue M-3 from security review).

    Sends X-Service-Token when AGENT_SERVICE_TOKEN is configured. The agent
    treats this as the authoritative auth for inter-service calls — if the
    agent enforces it, requests without the header are 401/403. While the
    agent rollout is in progress, leaving AGENT_SERVICE_TOKEN unset on
    backend means we send no header and the agent (if not yet enforcing)
    keeps accepting us. Safe both-ways during the rollout window.
    """
    if settings.agent_service_token:
        return {"X-Service-Token": settings.agent_service_token}
    return {}


def _post(path: str, contract_id: str, extra: dict[str, Any] | None = None) -> dict[str, Any]:
    url = f"{settings.agent_base_url}{path}"
    log.debug("agent call → %s contract=%s", path, contract_id)
    body = {"contract_id": str(contract_id), **(extra or {})}
    resp = httpx.post(url, json=body, headers=_service_headers(), timeout=_TIMEOUT)
    resp.raise_for_status()
    result = resp.json()
    log.debug("agent result ← %s:\n%s", path, json.dumps(result, indent=2, default=str))
    return result


def _get(path: str, **params) -> dict[str, Any]:
    url = f"{settings.agent_base_url}{path}"
    resp = httpx.get(url, params=params, headers=_service_headers(), timeout=_TIMEOUT)
    resp.raise_for_status()
    return resp.json()


def _stream_sse(path: str, contract_id: str, on_reasoning: Callable[[str], None]) -> dict[str, Any]:
    """Call a /stream SSE endpoint, invoke on_reasoning for each reasoning_delta, return the result dict."""
    url = f"{settings.agent_base_url}{path}"
    result: dict[str, Any] = {}
    current_event: str | None = None
    log.debug("agent stream → %s contract=%s", path, contract_id)
    with httpx.stream("POST", url, json={"contract_id": str(contract_id)},
                      headers=_service_headers(), timeout=_TIMEOUT) as resp:
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
                    text = data.get("text", "")
                    log.debug("agent thinking [%s]: %s", path, text)
                    on_reasoning(text)
                elif current_event == "result":
                    result = data
                    log.debug("agent result ← %s:\n%s", path, json.dumps(result, indent=2, default=str))
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


def generate_agent_offer(
    contract_id: str,
    underwriting_result: dict[str, Any] | None = None,
    on_reasoning: Callable[[str], None] | None = None,
) -> dict[str, Any]:
    """
    LLM negotiation offer.
    Pass underwriting_result to avoid the agent re-reading the audit log.
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
    extra = {"underwriting_result": underwriting_result} if underwriting_result else None
    if on_reasoning is not None:
        url = f"{settings.agent_base_url}/agent/agent-offer/stream"
        body = {"contract_id": str(contract_id), **(extra or {})}
        log.debug("agent stream → /agent/agent-offer/stream contract=%s", contract_id)
        result: dict[str, Any] = {}
        current_event: str | None = None
        with httpx.stream("POST", url, json=body, headers=_service_headers(), timeout=_TIMEOUT) as resp:
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
    return _post("/agent/agent-offer", contract_id, extra)


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


def execute_ads_actions(contract_id: str, access_token: str | None = None) -> dict[str, Any]:
    """
    Execute approved Meta Ads actions.
    Expected return shape:
    {
        "summary": str,
        "actions_executed": list[dict],
    }
    """
    extra = {"access_token": access_token} if access_token else None
    return _post("/agent/execute-ads", contract_id, extra)


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


def generate_plan(
    contract_id: str,
    user_id: str,
    meta_ads_account_id: str | None = None,
    access_token: str | None = None,
) -> dict[str, Any]:
    """
    Generate a Meta Ads campaign plan as individual approval_request messages.
    Trigger: Funded transition. Respects user.approval_mode ('manual' | 'auto').
    Expected return shape:
    {
        "plan_id": str,
        "action_count": int,
        "approval_mode": str,
        "strategy_summary": str,
    }
    """
    url = f"{settings.agent_base_url}/agent/generate-plan"
    log.debug("agent call → /agent/generate-plan contract=%s user=%s", contract_id, user_id)
    body: dict[str, Any] = {
        "contract_id": str(contract_id),
        "user_id": str(user_id),
        "meta_ads_account_id": meta_ads_account_id,
    }
    if access_token:
        body["access_token"] = access_token
    resp = httpx.post(url, json=body, headers=_service_headers(), timeout=_TIMEOUT)
    resp.raise_for_status()
    result = resp.json()
    log.debug("agent result ← /agent/generate-plan:\n%s", json.dumps(result, indent=2, default=str))
    return result


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
