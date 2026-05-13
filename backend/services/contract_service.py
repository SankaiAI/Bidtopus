import logging
from datetime import datetime, timezone

import bleach
from fastapi import HTTPException
from sqlalchemy.orm import Session

import db.repo as repo
import db.messages_repo as messages_repo
import agent_client
from db.models import PerformanceContract, User

log = logging.getLogger(__name__)


def _sanitize(text: str) -> str:
    return bleach.clean(text, tags=[], strip=True)


def _require_status(contract: PerformanceContract, expected: str) -> None:
    if contract.status != expected:
        log.warning(
            "State gate rejected contract=%s expected=%s actual=%s",
            contract.id, expected, contract.status,
        )
        raise HTTPException(
            status_code=400,
            detail=f"Contract must be in '{expected}' status (current: '{contract.status}')",
        )


def require_contract_owner(
    db: Session,
    contract_id: str,
    current_user: User,
) -> PerformanceContract:
    contract = repo.get_contract(db, contract_id)
    if contract is None:
        raise HTTPException(status_code=404, detail="Contract not found")
    if contract.merchant_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized for this contract")
    return contract


# ── Create ────────────────────────────────────────────────────────────────────

def create_contract(db: Session, merchant_id: str, data: dict) -> PerformanceContract:
    log.info("Creating contract merchant=%s", merchant_id)
    contract = repo.create_contract(
        db,
        merchant_id=merchant_id,
        target_metric="ROAS",
        threshold=data["target_roas"],
        minimum_spend=data["min_spend_usd"],
        time_window_days=data["time_window_days"],
        success_fee_usdc=data["success_fee_usdc"],
        campaign_mode=data["campaign_mode"],
        campaign_goal=data.get("campaign_goal"),
        account_context=data.get("account_context"),
    )
    messages_repo.append(
        db, contract.id, "system", "system_event",
        content="Contract created",
        extra={"status": "Created"},
    )
    repo.log_audit_event(db, contract.id, "contract", "result", {"action": "created", "merchant_id": merchant_id})
    log.info("Contract created id=%s", contract.id)
    return contract


# ── Underwrite ────────────────────────────────────────────────────────────────

def run_underwriting(db: Session, contract: PerformanceContract) -> dict:
    log.info("Underwriting started contract=%s", contract.id)
    _require_status(contract, "Created")

    repo.log_audit_event(db, contract.id, "ml_underwriting", "intent", {"contract_id": contract.id})

    result = agent_client.run_underwriting(contract.id)

    repo.save_underwriting_result(
        db,
        contract_id=contract.id,
        success_probability=result["success_probability"],
        risk_level=result["risk_level"],
        expected_roas_range=result["expected_roas_range"],
        recommendation=result["recommendation"],
        recommended_fee_usdc=result["recommended_fee_usdc"],
    )
    repo.update_contract_status(db, contract.id, "Underwriting")
    log.info("Underwriting complete contract=%s risk=%s prob=%.2f", contract.id, result["risk_level"], result["success_probability"])
    repo.log_audit_event(db, contract.id, "ml_underwriting", "result", result)
    messages_repo.append(
        db, contract.id, "system", "system_event",
        content="Underwriting complete",
        extra={"risk_level": result["risk_level"]},
    )
    return result


# ── Agent Offer ───────────────────────────────────────────────────────────────

def generate_agent_offer(db: Session, contract: PerformanceContract) -> dict:
    log.info("Generating agent offer contract=%s", contract.id)
    _require_status(contract, "Underwriting")

    underwriting = repo.get_underwriting_result(db, contract.id)
    if underwriting is None:
        raise HTTPException(status_code=400, detail="Underwriting result required before generating offer")

    repo.log_audit_event(db, contract.id, "llm_negotiation", "intent", {"contract_id": contract.id})

    result = agent_client.generate_agent_offer(contract.id)

    offer = repo.save_agent_offer(
        db,
        contract_id=contract.id,
        offer_type=result["offer_type"],
        message=_sanitize(result["message"]),
        revised_threshold=result.get("revised_threshold"),
        revised_fee_usdc=result.get("revised_fee_usdc"),
        revised_time_window_days=result.get("revised_time_window_days"),
    )
    repo.update_contract_status(db, contract.id, "Offered")
    log.info("Agent offer generated contract=%s offer_type=%s", contract.id, result["offer_type"])
    repo.log_audit_event(db, contract.id, "llm_negotiation", "result", result)
    messages_repo.append(
        db, contract.id, "agent", "message",
        content=_sanitize(result["message"]),
        extra={"offer_type": result["offer_type"], "offer_id": offer.id},
    )
    return result


# ── Accept Offer ──────────────────────────────────────────────────────────────

def accept_offer(db: Session, contract: PerformanceContract, offer_id: str) -> PerformanceContract:
    _require_status(contract, "Offered")

    offer = repo.get_latest_agent_offer(db, contract.id)
    if offer is None or offer.id != offer_id:
        raise HTTPException(status_code=400, detail="Offer not found or does not match contract")
    if offer.offer_type not in ("accept", "counteroffer"):
        raise HTTPException(status_code=400, detail="Offer type cannot be accepted (rejected)")

    repo.update_contract_status(db, contract.id, "FundedPending")
    log.info("Offer accepted contract=%s offer=%s → FundedPending", contract.id, offer_id)
    repo.log_audit_event(db, contract.id, "contract", "result", {"action": "offer_accepted", "offer_id": offer_id})
    messages_repo.append(
        db, contract.id, "system", "system_event",
        content="Merchant accepted offer — awaiting escrow",
        extra={"offer_id": offer_id},
    )
    return repo.get_contract(db, contract.id)


# ── Fund Escrow ───────────────────────────────────────────────────────────────

def fund_escrow(
    db: Session,
    contract: PerformanceContract,
    current_user: User,
    tx_hash: str,
    chain_contract_id: str,
    amount_usdc: float,
) -> dict:
    _require_status(contract, "FundedPending")

    if not current_user.wallet_address:
        raise HTTPException(status_code=400, detail="Wallet address required for escrow funding")

    record = repo.create_escrow_record(
        db,
        contract_id=contract.id,
        chain_contract_id=chain_contract_id,
        tx_hash=tx_hash,
        amount_usdc=amount_usdc,
        status="funded",
    )
    repo.update_contract_status(db, contract.id, "Funded", funded_at=datetime.now(timezone.utc))
    log.info("Escrow funded contract=%s tx=%s amount=%.2f USDC", contract.id, tx_hash, amount_usdc)
    repo.log_audit_event(db, contract.id, "arc_escrow", "result", {
        "tx_hash": tx_hash,
        "chain_contract_id": chain_contract_id,
        "amount_usdc": amount_usdc,
    })
    messages_repo.append(
        db, contract.id, "system", "system_event",
        content=f"Escrow funded — {amount_usdc} USDC locked on-chain",
        extra={"tx_hash": tx_hash, "chain_contract_id": chain_contract_id},
    )
    return {"escrow_id": record.id, "status": "funded", "tx_hash": tx_hash}


# ── Generate Strategy ─────────────────────────────────────────────────────────

def generate_strategy(db: Session, contract: PerformanceContract) -> dict:
    log.info("Generating strategy contract=%s", contract.id)
    _require_status(contract, "Funded")

    repo.log_audit_event(db, contract.id, "llm_strategy", "intent", {"contract_id": contract.id})

    result = agent_client.generate_strategy(contract.id)

    plan = repo.save_strategy_plan(
        db,
        contract_id=contract.id,
        summary=_sanitize(result["summary"]),
        planned_actions=result["planned_actions"],
        approval_status="pending",
    )
    log.info("Strategy plan generated contract=%s plan=%s", contract.id, plan.id)
    repo.log_audit_event(db, contract.id, "llm_strategy", "result", result)
    messages_repo.append(
        db, contract.id, "agent", "approval_request",
        content=_sanitize(result["summary"]),
        extra={"plan_id": plan.id, "planned_actions": result["planned_actions"]},
        status="pending",
    )
    return {"plan_id": plan.id, **result}


# ── Approve Execution ─────────────────────────────────────────────────────────

def approve_execution(db: Session, contract: PerformanceContract, plan_id: str, approved: bool) -> dict:
    plan = repo.get_latest_strategy_plan(db, contract.id)
    if plan is None or plan.id != plan_id:
        raise HTTPException(status_code=400, detail="Strategy plan not found")
    if plan.approval_status != "pending":
        raise HTTPException(status_code=400, detail="Strategy plan is not pending approval")

    if approved:
        repo.approve_strategy_plan(db, plan.id)
        repo.update_contract_status(db, contract.id, "Active")
        log.info("Strategy approved contract=%s plan=%s → Active", contract.id, plan_id)
        repo.log_audit_event(db, contract.id, "contract", "result", {"action": "strategy_approved", "plan_id": plan_id})
        messages_repo.append(
            db, contract.id, "system", "system_event",
            content="Strategy approved — agent is now executing",
            extra={"plan_id": plan_id},
        )
        return {"status": "Active", "plan_id": plan_id, "approval_status": "approved"}
    else:
        repo.decline_strategy_plan(db, plan.id)
        log.info("Strategy declined contract=%s plan=%s", contract.id, plan_id)
        repo.log_audit_event(db, contract.id, "contract", "result", {"action": "strategy_declined", "plan_id": plan_id})
        messages_repo.append(
            db, contract.id, "system", "system_event",
            content="Strategy declined by merchant",
            extra={"plan_id": plan_id},
        )
        return {"status": "Funded", "plan_id": plan_id, "approval_status": "declined"}


# ── Execute Ads Actions ────────────────────────────────────────────────────────

def execute_ads_actions(db: Session, contract: PerformanceContract) -> dict:
    log.info("Executing ads actions contract=%s", contract.id)
    _require_status(contract, "Active")

    plan = repo.get_latest_strategy_plan(db, contract.id)
    if plan is None or plan.approval_status != "approved":
        raise HTTPException(status_code=400, detail="Strategy must be merchant-approved before execution")

    repo.log_audit_event(db, contract.id, "meta_ads", "intent", {"contract_id": contract.id, "plan_id": plan.id})

    result = agent_client.execute_ads_actions(contract.id)

    log.info("Ads actions executed contract=%s", contract.id)
    repo.log_audit_event(db, contract.id, "meta_ads", "result", result)
    messages_repo.append(
        db, contract.id, "agent", "message",
        content=_sanitize(result.get("summary", "Ad actions executed")),
        extra=result,
    )
    return result


# ── Performance ───────────────────────────────────────────────────────────────

def get_performance(db: Session, contract: PerformanceContract) -> dict:
    snapshot = repo.get_latest_snapshot(db, contract.id)
    if snapshot is None:
        return {
            "contract_id": contract.id,
            "spend": 0.0,
            "revenue": 0.0,
            "roas": None,
            "success_probability": None,
            "timestamp": None,
        }
    return {
        "id": snapshot.id,
        "contract_id": snapshot.contract_id,
        "spend": snapshot.spend,
        "revenue": snapshot.revenue,
        "roas": snapshot.roas,
        "success_probability": snapshot.success_probability,
        "timestamp": snapshot.timestamp,
    }


# ── Resolve ───────────────────────────────────────────────────────────────────

def resolve_contract(db: Session, contract: PerformanceContract) -> dict:
    log.info("Resolution requested contract=%s", contract.id)
    # Idempotency — safe for network retries
    existing = repo.get_resolution(db, contract.id)
    if existing:
        log.info("Resolution idempotency hit contract=%s — returning existing record", contract.id)
        return {
            "id": existing.id,
            "contract_id": existing.contract_id,
            "final_spend": existing.final_spend,
            "final_revenue": existing.final_revenue,
            "final_roas": existing.final_roas,
            "outcome": existing.outcome,
            "settlement_tx_hash": existing.settlement_tx_hash,
            "resolved_at": existing.resolved_at,
        }

    _require_status(contract, "Active")

    from datetime import timezone
    if contract.funded_at:
        from datetime import timedelta
        window_end = contract.funded_at.replace(tzinfo=timezone.utc) + timedelta(days=contract.time_window_days)
        if datetime.now(timezone.utc) < window_end:
            raise HTTPException(status_code=400, detail="Evaluation window has not yet closed")

    repo.log_audit_event(db, contract.id, "resolution", "intent", {"contract_id": contract.id})

    result = agent_client.resolve_contract(contract.id)

    record = repo.save_resolution(
        db,
        contract_id=contract.id,
        final_spend=result["final_spend"],
        final_revenue=result["final_revenue"],
        final_roas=result["final_roas"],
        outcome=result["outcome"],
        settlement_tx_hash=result.get("settlement_tx_hash"),
    )

    new_status = "Settled"
    repo.update_contract_status(db, contract.id, new_status, resolved_at=datetime.now(timezone.utc))
    log.info("Contract resolved contract=%s outcome=%s roas=%.2f tx=%s", contract.id, result["outcome"], result["final_roas"], result.get("settlement_tx_hash"))
    repo.log_audit_event(db, contract.id, "resolution", "result", result)
    messages_repo.append(
        db, contract.id, "system", "system_event",
        content=f"Contract resolved — outcome: {result['outcome']}",
        extra={
            "outcome": result["outcome"],
            "final_roas": result["final_roas"],
            "settlement_tx_hash": result.get("settlement_tx_hash"),
        },
    )
    return {
        "id": record.id,
        "contract_id": record.contract_id,
        "final_spend": record.final_spend,
        "final_revenue": record.final_revenue,
        "final_roas": record.final_roas,
        "outcome": record.outcome,
        "settlement_tx_hash": record.settlement_tx_hash,
        "resolved_at": record.resolved_at,
    }
