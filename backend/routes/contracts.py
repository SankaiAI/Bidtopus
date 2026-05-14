from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from limiter import limiter

import db.messages_repo as messages_repo
import db.repo as repo
from auth.clerk import get_current_user
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
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from db.repo import list_contracts_for_merchant
    contracts = list_contracts_for_merchant(db, current_user.id)
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
    contract, _ = _resolve_action_message(db, contract_id, action_id, current_user)
    messages_repo.update_status(db, action_id, "approved")
    repo.log_audit_event(db, contract_id, "meta_ads", "intent", {
        "action": "action_approved", "action_id": action_id,
    })
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
