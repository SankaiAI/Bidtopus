from datetime import datetime, timezone, timedelta
from typing import Optional
import json as _json
import uuid as _uuid_mod

from sqlalchemy.orm import Session

from db.models import (
    User, PerformanceContract, UnderwritingResult, AgentOffer,
    EscrowRecord, StrategyPlan, PerformanceSnapshot, ResolutionRecord,
    AuditEvent,
)


# ── Users ────────────────────────────────────────────────────────────────────

def get_or_create_user(db: Session, clerk_user_id: str, email: str) -> User:
    user = db.query(User).filter(User.clerk_user_id == clerk_user_id).first()
    if user:
        return user
    user = User(clerk_user_id=clerk_user_id, email=email)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def get_user_by_id(db: Session, user_id: str) -> Optional[User]:
    return db.query(User).filter(User.id == user_id).first()


def update_wallet_address(db: Session, user_id: str, wallet_address: str) -> User:
    user = db.query(User).filter(User.id == user_id).first()
    user.wallet_address = wallet_address
    db.commit()
    db.refresh(user)
    return user


def update_user_settings(db: Session, user_id: str, **kwargs) -> User:
    user = db.query(User).filter(User.id == user_id).first()
    for k, v in kwargs.items():
        setattr(user, k, v)
    db.commit()
    db.refresh(user)
    return user


# ── Contracts ─────────────────────────────────────────────────────────────────

def create_contract(db: Session, merchant_id: str, **kwargs) -> PerformanceContract:
    contract = PerformanceContract(merchant_id=merchant_id, **kwargs)
    db.add(contract)
    db.commit()
    db.refresh(contract)
    return contract


def get_contract(db: Session, contract_id: str) -> Optional[PerformanceContract]:
    try:
        _uuid_mod.UUID(contract_id)
    except (ValueError, AttributeError):
        return None
    return db.query(PerformanceContract).filter(PerformanceContract.id == contract_id).first()


def update_contract_title(db: Session, contract_id: str, title: str) -> None:
    db.query(PerformanceContract).filter(PerformanceContract.id == contract_id).update(
        {"title": title}
    )
    db.commit()


def update_contract_status(db: Session, contract_id: str, status: str, **extra) -> PerformanceContract:
    # db.get() uses the identity map and refreshes expired objects — more reliable
    # than a plain filter().first() when the object was already loaded in this session
    # and multiple commits have since expired it (common in background tasks on Neon).
    contract = db.get(PerformanceContract, contract_id)
    if contract is None:
        raise ValueError(f"Contract {contract_id} not found for status update")
    contract.status = status
    for k, v in extra.items():
        setattr(contract, k, v)
    db.commit()
    db.refresh(contract)
    return contract


def finalize_negotiating_contract(
    db: Session,
    contract_id: str,
    threshold: float,
    minimum_spend: float,
    time_window_days: int,
    success_fee_usdc: float,
    campaign_mode: str,
    campaign_goal: str = "",
) -> PerformanceContract:
    contract = get_contract(db, contract_id)
    if contract.status != "Negotiating":
        raise ValueError(f"Cannot finalize contract in status '{contract.status}' — already finalized or invalid state")
    contract.status = "Created"
    contract.threshold = threshold
    contract.minimum_spend = minimum_spend
    contract.time_window_days = time_window_days
    contract.success_fee_usdc = success_fee_usdc
    contract.campaign_mode = campaign_mode
    contract.campaign_goal = campaign_goal
    db.commit()
    db.refresh(contract)
    return contract


def list_contracts_for_merchant(db: Session, merchant_id: str) -> list[PerformanceContract]:
    return (
        db.query(PerformanceContract)
        .filter(PerformanceContract.merchant_id == merchant_id)
        .order_by(PerformanceContract.created_at.desc())
        .all()
    )


# ── Underwriting ──────────────────────────────────────────────────────────────

def save_underwriting_result(db: Session, contract_id: str, **kwargs) -> UnderwritingResult:
    result = UnderwritingResult(contract_id=contract_id, **kwargs)
    db.add(result)
    db.commit()
    db.refresh(result)
    return result


def get_underwriting_result(db: Session, contract_id: str) -> Optional[UnderwritingResult]:
    return (
        db.query(UnderwritingResult)
        .filter(UnderwritingResult.contract_id == contract_id)
        .order_by(UnderwritingResult.created_at.desc())
        .first()
    )


# ── Agent Offers ──────────────────────────────────────────────────────────────

def save_agent_offer(db: Session, contract_id: str, **kwargs) -> AgentOffer:
    offer = AgentOffer(contract_id=contract_id, **kwargs)
    db.add(offer)
    db.commit()
    db.refresh(offer)
    return offer


def get_latest_agent_offer(db: Session, contract_id: str) -> Optional[AgentOffer]:
    return (
        db.query(AgentOffer)
        .filter(AgentOffer.contract_id == contract_id)
        .order_by(AgentOffer.created_at.desc())
        .first()
    )


# ── Escrow ────────────────────────────────────────────────────────────────────

def create_escrow_record(db: Session, contract_id: str, **kwargs) -> EscrowRecord:
    record = EscrowRecord(contract_id=contract_id, **kwargs)
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def get_escrow_record(db: Session, contract_id: str) -> Optional[EscrowRecord]:
    return (
        db.query(EscrowRecord)
        .filter(EscrowRecord.contract_id == contract_id)
        .order_by(EscrowRecord.created_at.desc())
        .first()
    )


def update_escrow_status(db: Session, record_id: str, **kwargs) -> EscrowRecord:
    record = db.query(EscrowRecord).filter(EscrowRecord.id == record_id).first()
    for k, v in kwargs.items():
        setattr(record, k, v)
    db.commit()
    db.refresh(record)
    return record


# ── Strategy Plans ────────────────────────────────────────────────────────────

def save_strategy_plan(db: Session, contract_id: str, **kwargs) -> StrategyPlan:
    plan = StrategyPlan(contract_id=contract_id, **kwargs)
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan


def get_latest_strategy_plan(db: Session, contract_id: str) -> Optional[StrategyPlan]:
    return (
        db.query(StrategyPlan)
        .filter(StrategyPlan.contract_id == contract_id)
        .order_by(StrategyPlan.created_at.desc())
        .first()
    )


def approve_strategy_plan(db: Session, plan_id: str) -> StrategyPlan:
    plan = db.query(StrategyPlan).filter(StrategyPlan.id == plan_id).first()
    plan.approval_status = "approved"
    plan.approved_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(plan)
    return plan


def decline_strategy_plan(db: Session, plan_id: str) -> StrategyPlan:
    plan = db.query(StrategyPlan).filter(StrategyPlan.id == plan_id).first()
    plan.approval_status = "declined"
    db.commit()
    db.refresh(plan)
    return plan


# ── Performance Snapshots ─────────────────────────────────────────────────────

def save_performance_snapshot(db: Session, contract_id: str, **kwargs) -> PerformanceSnapshot:
    snapshot = PerformanceSnapshot(contract_id=contract_id, **kwargs)
    db.add(snapshot)
    db.commit()
    db.refresh(snapshot)
    return snapshot


def get_latest_snapshot(db: Session, contract_id: str) -> Optional[PerformanceSnapshot]:
    return (
        db.query(PerformanceSnapshot)
        .filter(PerformanceSnapshot.contract_id == contract_id)
        .order_by(PerformanceSnapshot.timestamp.desc())
        .first()
    )


# ── Resolution ────────────────────────────────────────────────────────────────

def get_resolution(db: Session, contract_id: str) -> Optional[ResolutionRecord]:
    return (
        db.query(ResolutionRecord)
        .filter(ResolutionRecord.contract_id == contract_id)
        .first()
    )


def save_resolution(db: Session, contract_id: str, **kwargs) -> ResolutionRecord:
    record = ResolutionRecord(contract_id=contract_id, **kwargs)
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


# ── Audit Events ──────────────────────────────────────────────────────────────

def log_audit_event(
    db: Session,
    contract_id: str,
    component: str,
    event_type: str,
    payload: dict,
) -> AuditEvent:
    safe_payload = _json.loads(_json.dumps(payload, default=str))
    event = AuditEvent(
        contract_id=str(contract_id),
        component=component,
        event_type=event_type,
        payload=safe_payload,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


def get_audit_events_since(db: Session, contract_id: str, days_ago: int) -> list[AuditEvent]:
    cutoff = datetime.now(timezone.utc) - timedelta(days=days_ago)
    return (
        db.query(AuditEvent)
        .filter(AuditEvent.contract_id == contract_id, AuditEvent.created_at >= cutoff)
        .order_by(AuditEvent.created_at.asc())
        .all()
    )


def get_latest_audit_by_type(db: Session, contract_id: str, event_type: str) -> Optional[AuditEvent]:
    return (
        db.query(AuditEvent)
        .filter(AuditEvent.contract_id == contract_id, AuditEvent.event_type == event_type)
        .order_by(AuditEvent.created_at.desc())
        .first()
    )


def get_audit_events_by_component(db: Session, contract_id: str, component: str) -> list[AuditEvent]:
    return (
        db.query(AuditEvent)
        .filter(AuditEvent.contract_id == contract_id, AuditEvent.component == component)
        .order_by(AuditEvent.created_at.asc())
        .all()
    )
