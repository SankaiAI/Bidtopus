import logging

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

log = logging.getLogger(__name__)

from limiter import limiter

import db.messages_repo as messages_repo
import db.repo as repo
import event_bus
from auth.clerk import get_current_user
from auth.service_token import verify_service_token
from db.models import (
    AgentOffer, AuditEvent, ContractMessage, EscrowRecord,
    PerformanceSnapshot, ResolutionRecord, StrategyPlan, UnderwritingResult,
)
from db.session import get_db
from models.schemas import (
    AcceptOfferRequest,
    ApproveExecutionRequest,
    ContractCreateRequest,
    ContractResponse,
    FundEscrowRequest,
    PerformanceIngestRequest,
    TitleUpdateRequest,
)
from services import contract_service

router = APIRouter(prefix="/api/contracts", tags=["contracts"])


# ── Create contract ───────────────────────────────────────────────────────────

@router.post("", status_code=201)
def create_contract(
    body: ContractCreateRequest,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    contract = contract_service.create_contract(db, current_user.id, body.model_dump())
    return ContractResponse.from_orm_contract(contract)


@router.get("")
def list_contracts(
    meta_ads_account_id: str | None = None,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if meta_ads_account_id is not None:
        account = repo.get_meta_account(db, meta_ads_account_id)
        if account is None or account.merchant_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not authorized for this account")
    from db.repo import list_contracts_for_merchant
    contracts = list_contracts_for_merchant(db, current_user.id, meta_ads_account_id)
    return [ContractResponse.from_orm_contract(c) for c in contracts]


@router.delete("/{contract_id}", status_code=204)
def delete_contract(
    contract_id: str,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    contract = repo.get_contract(db, contract_id)
    if contract is None:
        return Response(status_code=204)
    if contract.merchant_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized for this contract")

    for model in (
        ContractMessage, AuditEvent, PerformanceSnapshot, ResolutionRecord,
        StrategyPlan, EscrowRecord, AgentOffer, UnderwritingResult,
    ):
        db.query(model).filter_by(contract_id=contract.id).delete(synchronize_session=False)

    db.delete(contract)
    db.commit()
    return Response(status_code=204)


@router.patch("/{contract_id}/title")
def update_title(
    contract_id: str,
    body: TitleUpdateRequest,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    contract = contract_service.require_contract_owner(db, contract_id, current_user)
    repo.update_contract_title(db, contract_id, body.title)
    return {"id": str(contract.id), "title": body.title}


@router.get("/{contract_id}")
def get_contract(
    contract_id: str,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    contract = contract_service.require_contract_owner(db, contract_id, current_user)
    return ContractResponse.from_orm_contract(contract)


# ── Underwrite ────────────────────────────────────────────────────────────────

@router.post("/{contract_id}/underwrite")
@limiter.limit("10/minute")
def underwrite(
    request: Request,
    contract_id: str,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    contract = contract_service.require_contract_owner(db, contract_id, current_user)
    result = contract_service.run_underwriting(db, contract)
    return result


# ── Agent offer ───────────────────────────────────────────────────────────────

@router.post("/{contract_id}/agent-offer")
@limiter.limit("10/minute")
def agent_offer(
    request: Request,
    contract_id: str,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    contract = contract_service.require_contract_owner(db, contract_id, current_user)
    result = contract_service.generate_agent_offer(db, contract)
    return result


# ── Accept offer ──────────────────────────────────────────────────────────────

@router.post("/{contract_id}/accept")
def accept_offer(
    contract_id: str,
    body: AcceptOfferRequest,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    contract = contract_service.require_contract_owner(db, contract_id, current_user)
    updated = contract_service.accept_offer(db, contract, body.offer_id)
    return ContractResponse.from_orm_contract(updated)


# ── Fund escrow ───────────────────────────────────────────────────────────────

@router.post("/{contract_id}/fund-escrow")
def fund_escrow(
    contract_id: str,
    body: FundEscrowRequest,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    contract = contract_service.require_contract_owner(db, contract_id, current_user)
    result = contract_service.fund_escrow(
        db, contract, current_user,
        tx_hash=body.tx_hash,
        chain_contract_id=body.chain_contract_id,
        amount_usdc=body.amount_usdc,
    )
    return result


# ── Generate strategy ─────────────────────────────────────────────────────────

@router.post("/{contract_id}/generate-strategy")
@limiter.limit("10/minute")
def generate_strategy(
    request: Request,
    contract_id: str,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    contract = contract_service.require_contract_owner(db, contract_id, current_user)
    result = contract_service.generate_strategy(db, contract)
    return result


# ── Approve execution ─────────────────────────────────────────────────────────

@router.post("/{contract_id}/approve-execution")
def approve_execution(
    contract_id: str,
    body: ApproveExecutionRequest,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    contract = contract_service.require_contract_owner(db, contract_id, current_user)
    result = contract_service.approve_execution(db, contract, body.plan_id, body.approved)
    return result


# ── Execute ads ───────────────────────────────────────────────────────────────

@router.post("/{contract_id}/execute-ads-actions")
def execute_ads_actions(
    contract_id: str,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    contract = contract_service.require_contract_owner(db, contract_id, current_user)
    result = contract_service.execute_ads_actions(db, contract)
    return result


# ── Performance ───────────────────────────────────────────────────────────────

@router.get("/{contract_id}/performance")
def get_performance(
    contract_id: str,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    contract = contract_service.require_contract_owner(db, contract_id, current_user)
    return contract_service.get_performance(db, contract)


@router.post("/{contract_id}/performance", status_code=201)
def ingest_performance(
    contract_id: str,
    body: PerformanceIngestRequest,
    _: None = Depends(verify_service_token),
    db: Session = Depends(get_db),
):
    """
    Agent → backend ingest sink for Meta Ads performance snapshots.
    Auth: X-Service-Token header must match AGENT_SERVICE_TOKEN env var.
    """
    contract = repo.get_contract(db, contract_id)
    if contract is None:
        raise HTTPException(status_code=404, detail="Contract not found")
    if contract.status != "Active":
        # Snapshots arriving for non-Active contracts are dropped gracefully so the
        # agent doesn't retry into a tombstone.
        log.info("perf ingest: ignoring snapshot for non-Active contract=%s status=%s",
                 contract_id, contract.status)
        return Response(status_code=202)

    snapshot_kwargs = {
        "spend": body.spend,
        "revenue": body.revenue,
        "roas": body.roas,
        "success_probability": body.success_probability,
    }
    # Only pass timestamp if explicitly supplied — otherwise the column default fires
    if body.timestamp is not None:
        snapshot_kwargs["timestamp"] = body.timestamp
    snapshot = repo.save_performance_snapshot(db, contract_id=str(contract.id), **snapshot_kwargs)
    event_bus.publish(str(contract.id), "performance_update", {
        "spend": body.spend,
        "revenue": body.revenue,
        "roas": body.roas,
        "timestamp": snapshot.timestamp.isoformat(),
    })
    return {"id": snapshot.id, "timestamp": snapshot.timestamp.isoformat()}


# ── Resolve ───────────────────────────────────────────────────────────────────

@router.post("/{contract_id}/resolve")
def resolve(
    contract_id: str,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    contract = contract_service.require_contract_owner(db, contract_id, current_user)
    result = contract_service.resolve_contract(db, contract)
    return result


# ── Escrow info ───────────────────────────────────────────────────────────────

@router.get("/{contract_id}/escrow")
def get_escrow(
    contract_id: str,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    contract_service.require_contract_owner(db, contract_id, current_user)
    from db.repo import get_escrow_record
    record = get_escrow_record(db, contract_id)
    if record is None:
        raise HTTPException(status_code=404, detail="No escrow record for this contract")
    return {
        "id": str(record.id),
        "contract_id": str(record.contract_id),
        "fund_tx_hash": record.tx_hash,
        "settlement_tx_hash": record.settlement_tx_hash,
        "amount_usdc": record.amount_usdc,
        "status": record.status,
        "chain_contract_id": record.chain_contract_id,
        "created_at": record.created_at,
    }


# ── Resolution info ───────────────────────────────────────────────────────────

@router.get("/{contract_id}/resolution")
def get_resolution(
    contract_id: str,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    contract_service.require_contract_owner(db, contract_id, current_user)
    from db.repo import get_resolution, get_escrow_record
    record = get_resolution(db, contract_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Contract not yet resolved")
    escrow = get_escrow_record(db, contract_id)
    return {
        "id": str(record.id),
        "contract_id": str(record.contract_id),
        "final_spend": record.final_spend,
        "final_revenue": record.final_revenue,
        "final_roas": record.final_roas,
        "outcome": record.outcome,
        "settlement_tx_hash": record.settlement_tx_hash,
        "fund_tx_hash": escrow.tx_hash if escrow else None,
        "amount_usdc": escrow.amount_usdc if escrow else None,
        "resolved_at": record.resolved_at,
    }


# ── Per-action approval (manual approval mode) ────────────────────────────────

def _resolve_action_message(db: Session, contract_id: str, action_id: str, current_user):
    contract = contract_service.require_contract_owner(db, contract_id, current_user)
    msg = db.query(ContractMessage).filter_by(id=action_id, contract_id=contract_id).first()
    if msg is None:
        raise HTTPException(status_code=404, detail="Action not found")
    if msg.type != "approval_request":
        raise HTTPException(status_code=400, detail="Message is not an approval_request")
    if msg.status != "pending":
        raise HTTPException(status_code=400, detail="Action is not pending")
    return contract, msg


@router.post("/{contract_id}/actions/{action_id}/approve")
def approve_action(
    contract_id: str,
    action_id: str,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from db.models import ContractMessage
    contract, msg = _resolve_action_message(db, contract_id, action_id, current_user)
    messages_repo.update_status(db, action_id, "approved")
    repo.log_audit_event(db, contract_id, "meta_ads", "intent", {
        "action": "action_approved", "action_id": action_id,
    })

    # When every per-action card for this plan is approved, activate and execute
    plan_id = (msg.extra or {}).get("plan_id")
    if plan_id:
        pending = (
            db.query(ContractMessage)
            .filter_by(contract_id=contract_id, type="approval_request", status="pending")
            .filter(ContractMessage.extra["plan_id"].as_string() == plan_id)
            .count()
        )
        if pending == 0:
            log.info("All per-action cards approved — activating contract=%s plan=%s", contract_id, plan_id)
            repo.update_contract_status(db, contract_id, "Active")
            import agent_client as _agent_client
            try:
                _agent_client.activate_contract(contract_id)
            except Exception:
                log.exception("Failed to register monitoring job contract=%s", contract_id)
            from services.contract_service import _bg, _execute_ads_bg
            _bg(_execute_ads_bg, contract_id)

    return {"action_id": action_id, "status": "approved"}


@router.post("/{contract_id}/actions/{action_id}/decline")
def decline_action(
    contract_id: str,
    action_id: str,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    contract, _ = _resolve_action_message(db, contract_id, action_id, current_user)
    messages_repo.update_status(db, action_id, "declined")
    repo.log_audit_event(db, contract_id, "meta_ads", "intent", {
        "action": "action_declined", "action_id": action_id,
    })
    return {"action_id": action_id, "status": "declined"}
