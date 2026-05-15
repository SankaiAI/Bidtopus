"""Agent HTTP endpoints — called only by the backend, never by the frontend.

All endpoints accept { contract_id } and read the rest from the shared DB.
The backend is responsible for state transitions on performance_contracts;
the agent reads state and writes to audit_events + contract_messages.

Error mapping:
  StateError / ApprovalError / LLMValidationError → 422
  AdapterError                                    → 502
  Contract not found                              → 404
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from db.backend_models import PerformanceContractORM
from db.session import get_db
from exceptions import AdapterError, SafeAgentError
from models.types import (
    AccountContext,
    ContractTerms,
    ResolutionInput,
    UnderwritingInput,
)
import orchestrator
from utils.logging import attach_session, get_logger

logger = get_logger(__name__)
router = APIRouter(prefix="/agent", tags=["agent"])


# ── Request / response schemas ─────────────────────────────────────────────────

class ContractRequest(BaseModel):
    contract_id: str


class UnderwriteResponse(BaseModel):
    success_probability: float
    risk_level: str
    expected_roas_range: list[float]
    recommendation: str
    recommended_fee_usdc: float


class AgentOfferResponse(BaseModel):
    offer_type: str
    message: str
    revised_threshold: float | None
    revised_fee_usdc: float | None
    revised_time_window_days: int | None
    accepted_terms: dict | None


class GenerateStrategyResponse(BaseModel):
    strategy_summary: str
    actions: list[dict]
    estimated_daily_spend: float | None
    expected_roas: float | None


class ExecuteAdsResponse(BaseModel):
    actions_executed: list[dict]
    summary: str


class ResolveResponse(BaseModel):
    outcome: str
    final_spend: float
    final_revenue: float
    final_roas: float
    threshold: float
    minimum_spend_met: bool
    target_met: bool


class ActivateResponse(BaseModel):
    contract_id: str
    monitoring_scheduled: bool


class AccountContextResponse(BaseModel):
    meta_ads_account_id: str
    historical_roas_7d: float | None
    historical_roas_30d: float | None
    avg_daily_spend: float | None
    aov: float | None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_contract_or_404(contract_id: str, db: Session) -> PerformanceContractORM:
    contract = (
        db.query(PerformanceContractORM)
        .filter(PerformanceContractORM.id == uuid.UUID(contract_id))
        .first()
    )
    if not contract:
        raise HTTPException(status_code=404, detail=f"Contract {contract_id} not found")
    return contract


def _to_contract_terms(c: PerformanceContractORM) -> ContractTerms:
    # Fields are nullable during early negotiation — apply safe minimums so
    # ContractTerms validation passes. Underwriting will recommend actual values.
    return ContractTerms(
        contract_id=str(c.id),
        requested_target_roas=max(0.1, c.target_roas or 0.1),
        minimum_spend=c.minimum_spend or 0.0,
        time_window_days=max(1, c.time_window_days or 7),
        success_fee_usdc=max(1.0, c.success_fee_usdc or 1.0),
        campaign_type=c.campaign_type,
        campaign_goal=c.campaign_goal or "",
    )


def _to_account_context(c: PerformanceContractORM) -> AccountContext:
    return AccountContext(
        account_id=c.account_id or "act_0000000000",
        pixel_id=c.pixel_id,
        avg_daily_spend=c.avg_daily_spend,
        historical_roas_7d=c.historical_roas_7d,
        historical_roas_30d=c.historical_roas_30d,
        aov=c.aov,
    )


def _handle_agent_error(e: Exception, contract_id: str) -> None:
    logger.error("agent_endpoint_error", contract_id=contract_id, error=str(e))
    if isinstance(e, SafeAgentError):
        raise HTTPException(status_code=422, detail=str(e))
    if isinstance(e, AdapterError):
        raise HTTPException(status_code=502, detail=str(e))
    raise HTTPException(status_code=500, detail="Unexpected agent error")


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/underwrite", response_model=UnderwriteResponse)
def underwrite(body: ContractRequest, db: Session = Depends(get_db)):
    """Run ML underwriting model. Called when contract status = Created."""
    contract = _get_contract_or_404(body.contract_id, db)
    attach_session(body.contract_id)
    logger.info("request_received", contract_id=body.contract_id, action="underwrite", state=contract.status)
    try:
        result = orchestrator.underwrite(
            contract_id=body.contract_id,
            underwriting_input=UnderwritingInput(
                contract_terms=_to_contract_terms(contract),
                account_context=_to_account_context(contract),
            ),
            contract_status=contract.status,
            db=db,
        )
    except Exception as e:
        _handle_agent_error(e, body.contract_id)

    logger.info(
        "request_complete",
        contract_id=body.contract_id,
        action="underwrite",
        probability=result.success_probability,
        recommendation=result.recommendation,
    )
    return UnderwriteResponse(
        success_probability=result.success_probability,
        risk_level=result.risk_level,
        expected_roas_range=list(result.expected_roas_range),
        recommendation=result.recommendation,
        recommended_fee_usdc=result.recommended_fee_usdc,
    )


@router.post("/agent-offer", response_model=AgentOfferResponse)
def agent_offer(body: ContractRequest, db: Session = Depends(get_db)):
    """Generate LLM negotiation offer from latest underwriting result in audit log."""
    from db.audit_logger import AuditLogger

    contract = _get_contract_or_404(body.contract_id, db)
    attach_session(body.contract_id)
    logger.info("request_received", contract_id=body.contract_id, action="agent_offer", state=contract.status, turn=contract.negotiation_turn_count)
    audit = AuditLogger(db)

    # Read latest underwriting result from audit log
    underwriting_events = audit.get_by_component(body.contract_id, "ml_underwriting")
    result_events = [e for e in underwriting_events if e.event_type == "result"]
    if not result_events:
        raise HTTPException(
            status_code=422,
            detail="No underwriting result found. Call /underwrite first.",
        )

    latest = result_events[-1].payload.get("outputs", {})
    from models.types import UnderwritingResult
    try:
        underwriting_result = UnderwritingResult(**latest)
    except Exception:
        raise HTTPException(status_code=422, detail="Corrupt underwriting result in audit log")

    logger.info(
        "state_handoff",
        contract_id=body.contract_id,
        source="ml_underwriting audit_log",
        probability=underwriting_result.success_probability,
        risk_level=underwriting_result.risk_level,
        recommendation=underwriting_result.recommendation,
    )

    try:
        offer = orchestrator.generate_offer(
            contract_id=body.contract_id,
            contract_terms=_to_contract_terms(contract),
            underwriting_result=underwriting_result,
            contract_status=contract.status,
            turn_count=contract.negotiation_turn_count,
            db=db,
        )
    except Exception as e:
        _handle_agent_error(e, body.contract_id)

    logger.info(
        "request_complete",
        contract_id=body.contract_id,
        action="agent_offer",
        offer_type=offer.offer_type,
        turn=contract.negotiation_turn_count,
    )
    return AgentOfferResponse(
        offer_type=offer.offer_type,
        message=offer.message,
        revised_threshold=offer.revised_threshold,
        revised_fee_usdc=offer.revised_fee_usdc,
        revised_time_window_days=offer.revised_time_window_days,
        accepted_terms=offer.accepted_terms.model_dump() if offer.accepted_terms else None,
    )


@router.post("/generate-strategy", response_model=GenerateStrategyResponse)
def generate_strategy(body: ContractRequest, db: Session = Depends(get_db)):
    """Generate Meta Ads strategy plan. Called when contract status = Funded."""
    contract = _get_contract_or_404(body.contract_id, db)
    attach_session(body.contract_id)
    logger.info("request_received", contract_id=body.contract_id, action="generate_strategy", state=contract.status)
    try:
        plan = orchestrator.generate_strategy(
            contract_id=body.contract_id,
            contract_terms=_to_contract_terms(contract),
            account_context=_to_account_context(contract),
            contract_status=contract.status,
            db=db,
        )
    except Exception as e:
        _handle_agent_error(e, body.contract_id)

    logger.info(
        "request_complete",
        contract_id=body.contract_id,
        action="generate_strategy",
        action_count=len(plan.actions),
        estimated_daily_spend=plan.estimated_daily_spend,
        expected_roas=plan.expected_roas,
    )
    return GenerateStrategyResponse(
        strategy_summary=plan.strategy_summary,
        actions=[a.model_dump() for a in plan.actions],
        estimated_daily_spend=plan.estimated_daily_spend,
        expected_roas=plan.expected_roas,
    )


@router.post("/execute-ads", response_model=ExecuteAdsResponse)
def execute_ads(body: ContractRequest, db: Session = Depends(get_db)):
    """Execute approved strategy actions. Re-reads approval from DB with row lock."""
    contract = _get_contract_or_404(body.contract_id, db)
    attach_session(body.contract_id)
    logger.info("request_received", contract_id=body.contract_id, action="execute_ads", state=contract.status)
    try:
        results = orchestrator.execute_ads_actions(
            contract_id=body.contract_id,
            contract_status=contract.status,
            db=db,
        )
    except Exception as e:
        _handle_agent_error(e, body.contract_id)

    logger.info("request_complete", contract_id=body.contract_id, action="execute_ads", actions_executed=len(results))
    return ExecuteAdsResponse(
        actions_executed=results,
        summary=f"Executed {len(results)} action(s) for contract {body.contract_id}",
    )


@router.get("/account-context", response_model=AccountContextResponse)
def get_account_context(meta_ads_account_id: str):
    """Return historical Meta Ads context for an account.

    Called by the backend at negotiation start to populate account_context before
    underwriting runs. Always returns 200 — null fields when data is unavailable.
    """
    from adapters.meta_ads import get_meta_ads_adapter

    logger.info("request_received", action="get_account_context", account_id=meta_ads_account_id)
    try:
        adapter = get_meta_ads_adapter()
        data = adapter.get_account_context(meta_ads_account_id)
    except Exception as exc:
        logger.error("account_context_fetch_failed", account_id=meta_ads_account_id, error=str(exc))
        data = {
            "meta_ads_account_id": meta_ads_account_id,
            "historical_roas_7d": None,
            "historical_roas_30d": None,
            "avg_daily_spend": None,
            "aov": None,
        }
    logger.info("request_complete", action="get_account_context", account_id=meta_ads_account_id)
    return AccountContextResponse(**data)


@router.post("/activate", response_model=ActivateResponse)
def activate(body: ContractRequest, db: Session = Depends(get_db)):
    """Register 24h monitoring job for a contract that just transitioned to Active.

    Called by the backend immediately after a contract status moves to Active.
    Idempotent — safe to call multiple times for the same contract.
    """
    from scheduler import register_monitoring_job

    contract = _get_contract_or_404(body.contract_id, db)
    attach_session(body.contract_id)
    logger.info("request_received", contract_id=body.contract_id, action="activate", state=contract.status)

    if contract.status != "Active":
        raise HTTPException(
            status_code=422,
            detail=f"Contract is not Active (current status: {contract.status}). Monitoring only runs for Active contracts.",
        )

    register_monitoring_job(body.contract_id)

    logger.info("request_complete", contract_id=body.contract_id, action="activate")
    return ActivateResponse(contract_id=body.contract_id, monitoring_scheduled=True)


@router.post("/resolve", response_model=ResolveResponse)
def resolve(body: ContractRequest, db: Session = Depends(get_db)):
    """Deterministic resolution + Arc escrow settlement. No LLM involved."""
    from db.audit_logger import AuditLogger

    contract = _get_contract_or_404(body.contract_id, db)
    attach_session(body.contract_id)
    logger.info("request_received", contract_id=body.contract_id, action="resolve", state=contract.status)
    audit = AuditLogger(db)

    # Read latest performance snapshot from audit log
    snapshot = audit.get_latest_snapshot(body.contract_id)
    if not snapshot:
        raise HTTPException(
            status_code=422,
            detail="No performance snapshot found. Run monitoring tick first.",
        )

    # Determine if evaluation window is complete
    window_complete = False
    if contract.window_end:
        window_complete = datetime.now(timezone.utc) >= contract.window_end.replace(tzinfo=timezone.utc)

    logger.info(
        "state_handoff",
        contract_id=body.contract_id,
        source="meta_ads snapshot audit_log",
        final_roas=snapshot.get("roas"),
        final_spend=snapshot.get("spend"),
        target_roas=contract.target_roas,
        minimum_spend=contract.minimum_spend,
        window_complete=window_complete,
    )

    try:
        result = orchestrator.resolve(
            contract_id=body.contract_id,
            resolution_input=ResolutionInput(
                contract_id=body.contract_id,
                final_spend=snapshot.get("spend", 0.0),
                final_revenue=snapshot.get("revenue", 0.0),
                final_roas=snapshot.get("roas", 0.0),
                target_roas=contract.target_roas,
                minimum_spend=contract.minimum_spend,
                evaluation_window_complete=window_complete,
            ),
            contract_status=contract.status,
            db=db,
        )
    except Exception as e:
        _handle_agent_error(e, body.contract_id)

    logger.info(
        "request_complete",
        contract_id=body.contract_id,
        action="resolve",
        outcome=result.outcome,
        target_met=result.target_met,
        minimum_spend_met=result.minimum_spend_met,
        final_roas=result.final_roas,
    )
    return ResolveResponse(
        outcome=result.outcome,
        final_spend=result.final_spend,
        final_revenue=result.final_revenue,
        final_roas=result.final_roas,
        threshold=result.threshold,
        minimum_spend_met=result.minimum_spend_met,
        target_met=result.target_met,
    )
