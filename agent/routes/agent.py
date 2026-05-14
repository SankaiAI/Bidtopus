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
from utils.logging import get_logger

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
    return ContractTerms(
        contract_id=str(c.id),
        requested_target_roas=c.target_roas,
        minimum_spend=c.minimum_spend,
        time_window_days=c.time_window_days,
        success_fee_usdc=c.success_fee_usdc,
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
    try:
        results = orchestrator.execute_ads_actions(
            contract_id=body.contract_id,
            contract_status=contract.status,
            db=db,
        )
    except Exception as e:
        _handle_agent_error(e, body.contract_id)

    return ExecuteAdsResponse(
        actions_executed=results,
        summary=f"Executed {len(results)} action(s) for contract {body.contract_id}",
    )


@router.post("/resolve", response_model=ResolveResponse)
def resolve(body: ContractRequest, db: Session = Depends(get_db)):
    """Deterministic resolution + Arc escrow settlement. No LLM involved."""
    from db.audit_logger import AuditLogger

    contract = _get_contract_or_404(body.contract_id, db)
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

    return ResolveResponse(
        outcome=result.outcome,
        final_spend=result.final_spend,
        final_revenue=result.final_revenue,
        final_roas=result.final_roas,
        threshold=result.threshold,
        minimum_spend_met=result.minimum_spend_met,
        target_met=result.target_met,
    )
