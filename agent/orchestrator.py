"""Agent Orchestrator — the entry point called by the backend.

Sequences all components based on contract state. Never routes on text.
Every step: log intent → execute → log result.

State machine:
    Created → Underwriting → Offered → FundedPending → Funded → Active → Resolving → Settled

Backend calls:
    underwrite(contract_id, input, db)       → POST /contracts/:id/underwrite
    generate_offer(contract_id, db)          → POST /contracts/:id/agent-offer
    generate_strategy(contract_id, input, db)→ POST /contracts/:id/generate-strategy
    execute_ads_actions(contract_id, db)     → POST /contracts/:id/execute-ads-actions
    get_performance(contract_id, day, db)    → GET  /contracts/:id/performance
    resolve(contract_id, input, db)          → POST /contracts/:id/resolve
    run_monitoring_tick(contract_id, db)     → called by background scheduler
"""
from __future__ import annotations

import json
from typing import Any, Generator

from sqlalchemy.orm import Session

from adapters.arc_escrow import get_arc_escrow_adapter
from adapters.circle_wallets import get_circle_wallets_adapter
from adapters.meta_ads import get_meta_ads_adapter
from config import settings
from db.audit_logger import AuditLogger
from db.messages_repo import MessagesRepo
from engine.resolution import ResolutionEngine
from exceptions import ApprovalError, NegotiationLimitError, StateError
from llm.negotiation import NegotiationLayer
from llm.strategy import StrategyGenerator
from ml.forecast import ForecastModel
from ml.underwriting import UnderwritingModel
from models.types import (
    AcceptedContractTerms,
    AccountContext,
    AgentOffer,
    ContractTerms,
    ForecastInput,
    ResolutionInput,
    ResolutionResult,
    StrategyPlan,
    UnderwritingInput,
    UnderwritingResult,
)
from utils.logging import get_logger

logger = get_logger(__name__)

# ── Valid state transitions ────────────────────────────────────────────────────
# Maps each contract state to the set of actions that are valid in that state.
VALID_ACTIONS: dict[str, list[str]] = {
    "Created":       ["run_underwriting"],
    "Negotiating":   ["run_underwriting", "generate_offer"],  # backend loops underwrite→offer each turn
    "Underwriting":  ["generate_offer"],
    "Offered":       ["await_merchant_response"],
    "FundedPending": ["confirm_escrow_funded"],
    "Funded":        ["generate_strategy"],
    "Active":        ["run_daily_monitoring", "execute_optimization"],
    "Resolving":     ["run_resolution_engine"],
    "Settled":       [],
    "Rejected":      [],
}


def _assert_valid_action(contract_status: str, action: str) -> None:
    allowed = VALID_ACTIONS.get(contract_status, [])
    if action not in allowed:
        raise StateError(
            f"Action '{action}' is invalid for contract in state '{contract_status}'. "
            f"Allowed: {allowed}"
        )
    logger.info("state_gate_passed", state=contract_status, action=action)


# ── Lazy singletons — loaded once at startup ──────────────────────────────────
_underwriting_model: UnderwritingModel | None = None
_forecast_model: ForecastModel | None = None
_negotiation_layer: NegotiationLayer | None = None
_strategy_generator: StrategyGenerator | None = None
_resolution_engine: ResolutionEngine | None = None


def _get_underwriting_model() -> UnderwritingModel:
    global _underwriting_model
    if _underwriting_model is None:
        _underwriting_model = UnderwritingModel()
    return _underwriting_model


def _get_forecast_model() -> ForecastModel:
    global _forecast_model
    if _forecast_model is None:
        _forecast_model = ForecastModel()
    return _forecast_model


def _get_negotiation_layer() -> NegotiationLayer:
    global _negotiation_layer
    if _negotiation_layer is None:
        _negotiation_layer = NegotiationLayer()
    return _negotiation_layer


def _get_strategy_generator() -> StrategyGenerator:
    global _strategy_generator
    if _strategy_generator is None:
        _strategy_generator = StrategyGenerator()
    return _strategy_generator


def _get_resolution_engine() -> ResolutionEngine:
    global _resolution_engine
    if _resolution_engine is None:
        _resolution_engine = ResolutionEngine()
    return _resolution_engine


# ── Public orchestrator functions ─────────────────────────────────────────────

def underwrite(
    contract_id: str,
    underwriting_input: UnderwritingInput,
    contract_status: str,
    db: Session,
) -> UnderwritingResult:
    """Step 1: Run ML underwriting model."""
    audit = AuditLogger(db)
    _assert_valid_action(contract_status, "run_underwriting")

    terms = underwriting_input.contract_terms
    ctx = underwriting_input.account_context
    logger.info(
        "underwriting_inputs",
        contract_id=contract_id,
        target_roas=terms.requested_target_roas,
        min_spend=terms.minimum_spend,
        window_days=terms.time_window_days,
        campaign_type=terms.campaign_type,
        historical_roas_7d=ctx.historical_roas_7d,
        historical_roas_30d=ctx.historical_roas_30d,
        avg_daily_spend=ctx.avg_daily_spend,
    )

    audit.log(contract_id, "ml_underwriting", "intent", {
        "inputs": underwriting_input.model_dump(),
    })

    result = _get_underwriting_model().predict(
        underwriting_input.contract_terms,
        underwriting_input.account_context,
    )

    audit.log(contract_id, "ml_underwriting", "result", {
        "inputs": underwriting_input.model_dump(),
        "outputs": result.model_dump(),
        "model_version": "1.0.0-synthetic",
    })

    logger.info(
        "underwriting_decision",
        contract_id=contract_id,
        probability=result.success_probability,
        risk_level=result.risk_level,
        expected_roas_range=result.expected_roas_range,
        recommendation=result.recommendation,
        recommended_fee_usdc=result.recommended_fee_usdc,
        accept_threshold=settings.ACCEPT_THRESHOLD,
        reject_threshold=settings.REJECT_THRESHOLD,
    )
    return result


def generate_offer(
    contract_id: str,
    contract_terms: ContractTerms,
    underwriting_result: UnderwritingResult,
    contract_status: str,
    turn_count: int,
    db: Session,
) -> tuple[AgentOffer, str | None]:
    """Step 2: LLM generates a structured offer from the underwriting result."""
    audit = AuditLogger(db)
    messages = MessagesRepo(db)

    _assert_valid_action(contract_status, "generate_offer")

    logger.info(
        "negotiation_inputs",
        contract_id=contract_id,
        turn=turn_count,
        max_turns=settings.MAX_NEGOTIATION_TURNS,
        probability=underwriting_result.success_probability,
        risk_level=underwriting_result.risk_level,
        recommendation=underwriting_result.recommendation,
        requested_roas=contract_terms.requested_target_roas,
        requested_fee=contract_terms.success_fee_usdc,
        recommended_fee=underwriting_result.recommended_fee_usdc,
    )

    if turn_count >= settings.MAX_NEGOTIATION_TURNS:
        logger.warning(
            "negotiation_turn_limit_reached",
            contract_id=contract_id,
            turn_count=turn_count,
            max_turns=settings.MAX_NEGOTIATION_TURNS,
        )
        auto_reject = AgentOffer(
            offer_type="reject",
            message=(
                "Negotiation limit reached. Please submit a new contract with revised terms. "
                "I was unable to find mutually agreeable terms within the allowed rounds."
            ),
            revised_threshold=None,
            revised_fee_usdc=None,
            revised_time_window_days=None,
        )
        audit.log(contract_id, "llm_negotiation", "result", {
            "offer_type": "reject",
            "reason": "turn_limit_reached",
            "turn_count": turn_count,
        })
        messages.append(
            contract_id, role="agent", type="message",
            content=auto_reject.message,
            metadata={"offer_type": "reject", "reason": "turn_limit_reached"},
        )
        raise NegotiationLimitError(auto_reject.message)

    audit.log(contract_id, "llm_negotiation", "intent", {
        "underwriting": underwriting_result.model_dump(),
        "contract_terms": contract_terms.model_dump(),
        "turn_count": turn_count,
    })

    offer, thinking = _get_negotiation_layer().generate_offer(contract_terms, underwriting_result)

    if offer.offer_type == "accept":
        offer = offer.model_copy(update={
            "accepted_terms": AcceptedContractTerms(
                decision="accept",
                roas_target=contract_terms.requested_target_roas,
                min_spend_usd=contract_terms.minimum_spend,
                window_days=contract_terms.time_window_days,
                fee_usdc=contract_terms.success_fee_usdc,
                success_probability=underwriting_result.success_probability,
            )
        })

    audit.log(contract_id, "llm_negotiation", "result", offer.model_dump())

    # Write to merchant-facing timeline
    messages.append(
        contract_id, role="agent", type="message",
        content=offer.message,
        metadata={
            "offer_type": offer.offer_type,
            "probability": underwriting_result.success_probability,
            "revised_threshold": offer.revised_threshold,
            "revised_fee_usdc": offer.revised_fee_usdc,
            "revised_time_window_days": offer.revised_time_window_days,
        },
    )

    logger.info(
        "offer_generated",
        contract_id=contract_id,
        offer_type=offer.offer_type,
        turn=turn_count,
        revised_threshold=offer.revised_threshold,
        revised_fee_usdc=offer.revised_fee_usdc,
        revised_time_window_days=offer.revised_time_window_days,
    )
    return offer, thinking


def generate_strategy(
    contract_id: str,
    contract_terms: ContractTerms,
    account_context: AccountContext,
    contract_status: str,
    db: Session,
) -> tuple[StrategyPlan, str | None]:
    """Step 3: LLM generates a Meta Ads strategy plan for merchant approval."""
    audit = AuditLogger(db)
    messages = MessagesRepo(db)

    _assert_valid_action(contract_status, "generate_strategy")

    logger.info(
        "strategy_inputs",
        contract_id=contract_id,
        target_roas=contract_terms.requested_target_roas,
        min_spend=contract_terms.minimum_spend,
        window_days=contract_terms.time_window_days,
        campaign_type=contract_terms.campaign_type,
        campaign_goal=contract_terms.campaign_goal,
        avg_daily_spend=account_context.avg_daily_spend,
        historical_roas_30d=account_context.historical_roas_30d,
    )

    audit.log(contract_id, "llm_strategy", "intent", {
        "contract_terms": contract_terms.model_dump(),
        "account_context": account_context.model_dump(),
    })

    plan, thinking = _get_strategy_generator().generate_strategy(contract_terms, account_context)

    audit.log(contract_id, "llm_strategy", "result", plan.model_dump())

    # Surface as approval_request — merchant must approve before any action
    messages.append(
        contract_id, role="agent", type="approval_request",
        content=plan.strategy_summary,
        metadata={
            "actions": [a.model_dump() for a in plan.actions],
            "estimated_daily_spend": plan.estimated_daily_spend,
            "expected_roas": plan.expected_roas,
        },
        status="pending",
    )

    logger.info(
        "strategy_generated",
        contract_id=contract_id,
        action_count=len(plan.actions),
    )
    return plan, thinking


def generate_plan(
    contract_id: str,
    contract_terms: ContractTerms,
    account_context: AccountContext,
    contract_status: str,
    db: Session,
) -> tuple[StrategyPlan, str | None]:
    """Like generate_strategy but without writing the aggregated approval_request.

    Used by POST /agent/generate-plan, which writes one approval_request per action.
    """
    audit = AuditLogger(db)
    _assert_valid_action(contract_status, "generate_strategy")

    audit.log(contract_id, "llm_strategy", "intent", {
        "contract_terms": contract_terms.model_dump(),
        "account_context": account_context.model_dump(),
    })

    plan, thinking = _get_strategy_generator().generate_strategy(contract_terms, account_context)
    audit.log(contract_id, "llm_strategy", "result", plan.model_dump())

    logger.info(
        "plan_generated",
        contract_id=contract_id,
        action_count=len(plan.actions),
    )
    return plan, thinking


def stream_offer(
    contract_id: str,
    contract_terms: ContractTerms,
    underwriting_result: UnderwritingResult,
    contract_status: str,
    turn_count: int,
    db: Session,
) -> Generator[str, None, None]:
    """Streaming variant of generate_offer — yields SSE strings for live reasoning display."""
    audit = AuditLogger(db)
    messages = MessagesRepo(db)

    _assert_valid_action(contract_status, "generate_offer")

    if turn_count >= settings.MAX_NEGOTIATION_TURNS:
        auto_reject = AgentOffer(
            offer_type="reject",
            message=(
                "Negotiation limit reached. Please submit a new contract with revised terms. "
                "I was unable to find mutually agreeable terms within the allowed rounds."
            ),
            revised_threshold=None,
            revised_fee_usdc=None,
            revised_time_window_days=None,
        )
        audit.log(contract_id, "llm_negotiation", "result", {
            "offer_type": "reject",
            "reason": "turn_limit_reached",
            "turn_count": turn_count,
        })
        messages.append(
            contract_id, role="agent", type="message",
            content=auto_reject.message,
            metadata={"offer_type": "reject", "reason": "turn_limit_reached"},
        )
        yield f"event: result\ndata: {auto_reject.model_dump_json()}\n\n"
        return

    audit.log(contract_id, "llm_negotiation", "intent", {
        "underwriting": underwriting_result.model_dump(),
        "contract_terms": contract_terms.model_dump(),
        "turn_count": turn_count,
    })

    for event_type, data in _get_negotiation_layer().iter_offer_events(contract_terms, underwriting_result):
        if event_type == "thinking":
            yield f"event: reasoning_delta\ndata: {json.dumps({'text': data})}\n\n"
        elif event_type == "result":
            offer: AgentOffer = data
            if offer.offer_type == "accept":
                offer = offer.model_copy(update={
                    "accepted_terms": AcceptedContractTerms(
                        decision="accept",
                        roas_target=contract_terms.requested_target_roas,
                        min_spend_usd=contract_terms.minimum_spend,
                        window_days=contract_terms.time_window_days,
                        fee_usdc=contract_terms.success_fee_usdc,
                        success_probability=underwriting_result.success_probability,
                    )
                })
            audit.log(contract_id, "llm_negotiation", "result", offer.model_dump())
            messages.append(
                contract_id, role="agent", type="message",
                content=offer.message,
                metadata={
                    "offer_type": offer.offer_type,
                    "probability": underwriting_result.success_probability,
                    "revised_threshold": offer.revised_threshold,
                    "revised_fee_usdc": offer.revised_fee_usdc,
                    "revised_time_window_days": offer.revised_time_window_days,
                },
            )
            logger.info("offer_generated", contract_id=contract_id, offer_type=offer.offer_type, turn=turn_count)
            yield f"event: result\ndata: {offer.model_dump_json()}\n\n"


def stream_strategy(
    contract_id: str,
    contract_terms: ContractTerms,
    account_context: AccountContext,
    contract_status: str,
    db: Session,
) -> Generator[str, None, None]:
    """Streaming variant of generate_strategy — yields SSE strings for live reasoning display."""
    audit = AuditLogger(db)
    messages = MessagesRepo(db)

    _assert_valid_action(contract_status, "generate_strategy")

    audit.log(contract_id, "llm_strategy", "intent", {
        "contract_terms": contract_terms.model_dump(),
        "account_context": account_context.model_dump(),
    })

    for event_type, data in _get_strategy_generator().iter_strategy_events(contract_terms, account_context):
        if event_type == "thinking":
            yield f"event: reasoning_delta\ndata: {json.dumps({'text': data})}\n\n"
        elif event_type == "result":
            plan: StrategyPlan = data
            audit.log(contract_id, "llm_strategy", "result", plan.model_dump())
            messages.append(
                contract_id, role="agent", type="approval_request",
                content=plan.strategy_summary,
                metadata={
                    "actions": [a.model_dump() for a in plan.actions],
                    "estimated_daily_spend": plan.estimated_daily_spend,
                    "expected_roas": plan.expected_roas,
                },
                status="pending",
            )
            logger.info("strategy_generated", contract_id=contract_id, action_count=len(plan.actions))
            yield f"event: result\ndata: {plan.model_dump_json()}\n\n"


def execute_ads_actions(
    contract_id: str,
    contract_status: str,
    db: Session,
) -> list[dict]:
    """Step 4: Execute approved strategy actions via Meta Ads adapter.

    Re-reads approval from DB with row-level lock — never trusts in-memory state.
    """
    from sqlalchemy import text

    audit = AuditLogger(db)
    _assert_valid_action(contract_status, "run_daily_monitoring")  # Active state

    # Re-read approval status with row lock (security rule 5)
    row = db.execute(
        text(
            "SELECT id, planned_actions, approval_status "
            "FROM strategy_plans WHERE contract_id = :cid "
            "FOR UPDATE"
        ),
        {"cid": contract_id},
    ).fetchone()

    if not row or row.approval_status != "approved":
        raise ApprovalError(
            f"Approval gate failed for contract {contract_id}: "
            f"strategy_plans.approval_status = {getattr(row, 'approval_status', 'not_found')}"
        )

    meta_ads = get_meta_ads_adapter()
    results = []

    for action_data in (row.planned_actions or []):
        from models.types import StrategyAction
        action = StrategyAction(**action_data)

        audit.log(contract_id, "meta_ads", "intent", {
            "action_type": action.type,
            "params": action.params,
        })

        result = meta_ads.execute_action(contract_id, action)

        audit.log(contract_id, "meta_ads", "result", {
            "action_type": action.type,
            "response": result,
        })
        results.append(result)

    logger.info(
        "ads_actions_executed",
        contract_id=contract_id,
        action_count=len(results),
    )
    return results


def get_performance(
    contract_id: str,
    day: int,
    target_roas: float,
    minimum_spend: float,
    days_elapsed: int,
    days_remaining: int,
    db: Session,
) -> dict[str, Any]:
    """Get current performance snapshot + live forecast."""
    audit = AuditLogger(db)
    messages = MessagesRepo(db)

    meta_ads = get_meta_ads_adapter()
    snapshot = meta_ads.get_performance(contract_id, day)

    forecast_input = ForecastInput(
        current_spend=snapshot.spend,
        current_revenue=snapshot.revenue,
        current_roas=snapshot.roas,
        days_elapsed=days_elapsed,
        days_remaining=days_remaining,
        target_roas=target_roas,
        minimum_spend=minimum_spend,
    )
    forecast = _get_forecast_model().predict(forecast_input)

    audit.log(contract_id, "meta_ads", "snapshot", {
        "spend": snapshot.spend,
        "revenue": snapshot.revenue,
        "roas": snapshot.roas,
        "success_probability": forecast.success_probability,
        "forecast_status": forecast.status,
        "day": day,
    })

    # Write daily_update to merchant timeline
    messages.append(
        contract_id, role="agent", type="daily_update",
        content=(
            f"Day {day}: ROAS {snapshot.roas:.2f}x | "
            f"Spend ${snapshot.spend:.0f} | "
            f"Forecast: {forecast.status} ({forecast.success_probability:.0%} confidence)"
        ),
        metadata={
            "snapshot": snapshot.model_dump(),
            "forecast": forecast.model_dump(),
        },
    )

    return {
        "snapshot": snapshot.model_dump(),
        "forecast": forecast.model_dump(),
    }


def run_monitoring_tick(
    contract_id: str,
    day: int,
    target_roas: float,
    minimum_spend: float,
    days_elapsed: int,
    days_remaining: int,
    evaluation_window_complete: bool,
    db: Session,
) -> dict[str, Any]:
    """Called by the background scheduler every 24h for Active contracts.

    Fetches performance, runs forecast, and triggers resolution if window is closed.
    """
    result = get_performance(
        contract_id=contract_id,
        day=day,
        target_roas=target_roas,
        minimum_spend=minimum_spend,
        days_elapsed=days_elapsed,
        days_remaining=days_remaining,
        db=db,
    )

    if evaluation_window_complete:
        snapshot = result["snapshot"]
        resolution_result = resolve(
            contract_id=contract_id,
            resolution_input=ResolutionInput(
                contract_id=contract_id,
                final_spend=snapshot["spend"],
                final_revenue=snapshot["revenue"],
                final_roas=snapshot["roas"],
                target_roas=target_roas,
                minimum_spend=minimum_spend,
                evaluation_window_complete=True,
            ),
            contract_status="Resolving",
            db=db,
        )
        result["resolution"] = resolution_result.model_dump()

    return result


def resolve(
    contract_id: str,
    resolution_input: ResolutionInput,
    contract_status: str,
    db: Session,
) -> ResolutionResult:
    """Deterministic resolution + USDC settlement via Arc escrow.

    Flow: resolution engine → audit log → arc adapter → settlement log.
    LLM never participates in this step.
    """
    audit = AuditLogger(db)
    messages = MessagesRepo(db)

    _assert_valid_action(contract_status, "run_resolution_engine")

    logger.info(
        "resolution_inputs",
        contract_id=contract_id,
        final_roas=resolution_input.final_roas,
        target_roas=resolution_input.target_roas,
        final_spend=resolution_input.final_spend,
        minimum_spend=resolution_input.minimum_spend,
        window_complete=resolution_input.evaluation_window_complete,
    )

    audit.log(contract_id, "resolution", "intent", {
        "inputs": resolution_input.model_dump(),
    })

    result = _get_resolution_engine().resolve(resolution_input)

    logger.info(
        "resolution_conditions",
        contract_id=contract_id,
        target_met=result.target_met,
        minimum_spend_met=result.minimum_spend_met,
        window_complete=result.evaluation_window_complete,
        final_roas=result.final_roas,
        threshold=result.threshold,
        outcome=result.outcome,
    )

    audit.log(contract_id, "resolution", "result", result.model_dump())

    # Trigger USDC settlement
    arc = get_arc_escrow_adapter()
    circle = get_circle_wallets_adapter()

    if result.outcome == "success":
        agent_wallet = circle.get_or_create_agent_wallet()
        audit.log(contract_id, "arc_escrow", "intent", {
            "action": "release",
            "agent_wallet": agent_wallet.address,
        })
        settlement = arc.release(contract_id, amount_usdc=0.0)  # amount from escrow contract
    else:
        audit.log(contract_id, "arc_escrow", "intent", {"action": "refund"})
        settlement = arc.refund(contract_id, amount_usdc=0.0)

    audit.log(contract_id, "arc_escrow", "result", {
        "tx_hash": settlement.tx_hash,
        "action": settlement.action,
        "amount_usdc": settlement.amount_usdc,
    })

    # Narration for merchant timeline
    if result.outcome == "success":
        narration = (
            f"Contract settled successfully. Final ROAS {result.final_roas:.2f}x "
            f"exceeded target {result.threshold:.2f}x. "
            f"USDC released to agent wallet. Tx: {settlement.tx_hash}"
        )
    else:
        reasons = []
        if not result.target_met:
            reasons.append(f"ROAS {result.final_roas:.2f}x < target {result.threshold:.2f}x")
        if not result.minimum_spend_met:
            reasons.append(f"spend ${result.final_spend:.0f} < minimum ${result.minimum_spend:.0f}")
        if not result.evaluation_window_complete:
            reasons.append("evaluation window not complete")
        narration = (
            f"Contract outcome: failure ({'; '.join(reasons)}). "
            f"USDC refunded to merchant. Tx: {settlement.tx_hash}"
        )

    messages.append(
        contract_id, role="agent", type="message",
        content=narration,
        metadata={
            "resolution": result.model_dump(),
            "settlement": settlement.model_dump(),
        },
    )

    logger.info(
        "contract_resolved",
        contract_id=contract_id,
        outcome=result.outcome,
        tx_hash=settlement.tx_hash,
    )
    return result
