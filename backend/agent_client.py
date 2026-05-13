"""
Single import boundary to the agent module.
All backend code calls through here — nothing else imports from agent/.
Returns plain dicts; the service layer owns persistence.
"""

from typing import Any


def _stub(name: str, **kwargs) -> dict[str, Any]:
    """Placeholder until agent/ module is wired up."""
    raise NotImplementedError(
        f"agent_client.{name} is not yet implemented — agent/ module not connected"
    )


def run_underwriting(contract_id: str) -> dict[str, Any]:
    """
    Call agent ML underwriting model.
    Expected return shape:
    {
        "success_probability": float,
        "risk_level": "low" | "medium" | "high",
        "expected_roas_range": [float, float],
        "recommendation": "accept" | "counteroffer" | "reject",
        "recommended_fee_usdc": float,
    }
    """
    try:
        from agent.orchestrator import underwrite
        return underwrite(contract_id)
    except ImportError:
        return _stub("run_underwriting", contract_id=contract_id)


def generate_agent_offer(contract_id: str) -> dict[str, Any]:
    """
    Call agent LLM negotiation to produce merchant offer.
    Expected return shape:
    {
        "offer_type": "accept" | "counteroffer" | "reject",
        "message": str,
        "revised_threshold": float | None,
        "revised_fee_usdc": float | None,
        "revised_time_window_days": int | None,
    }
    """
    try:
        from agent.orchestrator import generate_offer
        return generate_offer(contract_id)
    except ImportError:
        return _stub("generate_agent_offer", contract_id=contract_id)


def generate_strategy(contract_id: str) -> dict[str, Any]:
    """
    Call agent LLM to produce Meta Ads strategy plan.
    Expected return shape:
    {
        "summary": str,
        "planned_actions": list[dict],
    }
    """
    try:
        from agent.orchestrator import generate_strategy_plan
        return generate_strategy_plan(contract_id)
    except ImportError:
        return _stub("generate_strategy", contract_id=contract_id)


def execute_ads_actions(contract_id: str) -> dict[str, Any]:
    """
    Call agent Meta Ads adapter to execute approved strategy.
    Expected return shape:
    {
        "summary": str,
        "actions_executed": list[dict],
    }
    """
    try:
        from agent.orchestrator import execute_ads
        return execute_ads(contract_id)
    except ImportError:
        return _stub("execute_ads_actions", contract_id=contract_id)


def resolve_contract(contract_id: str) -> dict[str, Any]:
    """
    Call agent resolution logic + Arc on-chain settlement.
    Expected return shape:
    {
        "final_spend": float,
        "final_revenue": float,
        "final_roas": float,
        "outcome": "success" | "failure",
        "settlement_tx_hash": str | None,
    }
    """
    try:
        from agent.orchestrator import resolve
        return resolve(contract_id)
    except ImportError:
        return _stub("resolve_contract", contract_id=contract_id)
