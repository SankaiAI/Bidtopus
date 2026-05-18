import logging
import threading
import uuid
from datetime import datetime, timezone

import bleach
from fastapi import HTTPException
from sqlalchemy.orm import Session

import db.repo as repo
import db.messages_repo as messages_repo
import agent_client
import event_bus
from db.models import PerformanceContract, User
from db.session import SessionLocal

log = logging.getLogger(__name__)


def _bg(fn, *args):
    """Fire-and-forget: run fn(*args) in a daemon thread with its own DB session."""
    t = threading.Thread(target=fn, args=args, daemon=True)
    t.start()


def _generate_strategy_bg(contract_id: str) -> None:
    db = SessionLocal()
    sequence_id = str(uuid.uuid4())
    strategy_label = "Generating Meta Ads campaign plan..."
    detail_parts: list[str] = []
    event_bus.publish(contract_id, "thinking_step_start", {
        "step_id": "strategy",
        "label": strategy_label,
        "thinking_sequence_id": sequence_id,
    })
    try:
        contract = repo.get_contract(db, contract_id)
        if contract is None or contract.status != "Funded":
            log.warning("generate_strategy_bg: wrong state contract=%s status=%s", contract_id, getattr(contract, "status", None))
            return
        merchant = repo.get_user_by_id(db, contract.merchant_id)
        meta_ads_account_id = getattr(merchant, "meta_ads_account_id", None) if merchant else None
        log.info("generate_strategy_bg: starting contract=%s meta_ads_account_id=%s", contract_id, meta_ads_account_id)

        result = agent_client.generate_plan(
            contract_id=str(contract_id),
            user_id=str(contract.merchant_id),
            meta_ads_account_id=meta_ads_account_id,
        )
        summary = result.get("strategy_summary", "")
        action_count = result.get("action_count", 0)
        approval_mode = result.get("approval_mode", "manual")
        if summary:
            detail_parts.append(summary)
            event_bus.publish(contract_id, "thinking_step_detail", {"delta": summary})
        if action_count:
            if approval_mode == "auto":
                action_text = f"\n\n{action_count} action(s) auto-approved and ready to execute."
            else:
                action_text = f"\n\n{action_count} action(s) queued for your review."
            detail_parts.append(action_text)
            event_bus.publish(contract_id, "thinking_step_detail", {"delta": action_text})
        repo.log_audit_event(db, contract_id, "llm_strategy", "result", result)
        log.info("generate_strategy_bg: complete contract=%s plan=%s", contract_id, result.get("plan_id"))
    except Exception:
        log.exception("generate_strategy_bg: failed contract=%s", contract_id)
        fallback = "Strategy generation encountered an error. Will retry automatically."
        detail_parts.append(fallback)
        event_bus.publish(contract_id, "thinking_step_detail", {"delta": fallback})
    finally:
        reasoning_text = "".join(detail_parts)
        log.debug("agent reasoning [strategy] contract=%s:\n%s", contract_id, reasoning_text)
        messages_repo.append(
            db, contract_id, "agent", "thinking_step",
            content=reasoning_text,
            extra={"step_id": "strategy", "label": strategy_label, "thinking_sequence_id": sequence_id, "is_complete": True},
        )
        event_bus.publish(contract_id, "thinking_step_end", {"step_id": "strategy", "thinking_sequence_id": sequence_id})
        event_bus.publish(contract_id, "thinking_end", {"thinking_sequence_id": sequence_id})
        db.close()


def _execute_ads_bg(contract_id: str) -> None:
    db = SessionLocal()
    sequence_id = str(uuid.uuid4())
    execute_label = "Executing Meta Ads campaign actions..."
    detail_parts: list[str] = []
    event_bus.publish(contract_id, "thinking_step_start", {
        "step_id": "execute",
        "label": execute_label,
        "thinking_sequence_id": sequence_id,
    })
    try:
        contract = repo.get_contract(db, contract_id)
        if contract is None or contract.status != "Active":
            log.warning("execute_ads_bg: wrong state contract=%s status=%s", contract_id, getattr(contract, "status", None))
            return
        log.info("execute_ads_bg: starting contract=%s", contract_id)
        result = execute_ads_actions(db, contract)
        summary = result.get("summary", "Ad actions executed.")
        executed = result.get("actions_executed") or []
        detail = summary
        if executed:
            detail += f"\n\n{len(executed)} action(s) completed successfully."
        detail_parts.append(detail)
        event_bus.publish(contract_id, "thinking_step_detail", {"delta": detail})
        log.info("execute_ads_bg: complete contract=%s", contract_id)
    except Exception:
        log.exception("execute_ads_bg: failed contract=%s", contract_id)
        fallback = "Execution encountered an error. The monitoring scheduler will retry."
        detail_parts.append(fallback)
        event_bus.publish(contract_id, "thinking_step_detail", {"delta": fallback})
    finally:
        reasoning_text = "".join(detail_parts)
        log.debug("agent reasoning [execute] contract=%s:\n%s", contract_id, reasoning_text)
        messages_repo.append(
            db, contract_id, "agent", "thinking_step",
            content=reasoning_text,
            extra={"step_id": "execute", "label": execute_label, "thinking_sequence_id": sequence_id, "is_complete": True},
        )
        event_bus.publish(contract_id, "thinking_step_end", {"step_id": "execute", "thinking_sequence_id": sequence_id})
        event_bus.publish(contract_id, "thinking_end", {"thinking_sequence_id": sequence_id})
        db.close()


def _verify_fund_tx_onchain(tx_hash: str, contract_id: str, amount_usdc: float) -> None:
    """Verify tx_hash emitted Funded(contractId, _, _, amount, _) on Arc.

    No-ops with a warning when ARC_RPC_URL or ESCROW_CONTRACT_ADDRESS are not configured.
    Raises HTTPException on any verification failure.
    """
    from config import settings
    rpc_url = settings.arc_rpc_url
    contract_addr = settings.escrow_contract_address

    if not rpc_url or not contract_addr:
        log.warning(
            "Skipping on-chain fund verification (ARC_RPC_URL or ESCROW_CONTRACT_ADDRESS not set)"
            " contract=%s tx=%s",
            contract_id, tx_hash,
        )
        return

    import httpx
    from eth_hash.auto import keccak

    try:
        resp = httpx.post(
            rpc_url,
            json={"jsonrpc": "2.0", "method": "eth_getTransactionReceipt", "params": [tx_hash], "id": 1},
            timeout=10.0,
        )
        resp.raise_for_status()
        result = resp.json().get("result")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not fetch transaction receipt: {exc}")

    if result is None:
        raise HTTPException(status_code=400, detail=f"Transaction not found on Arc: {tx_hash}")

    if result.get("status") != "0x1":
        raise HTTPException(status_code=400, detail="Transaction reverted on-chain")

    to_addr = (result.get("to") or "").lower()
    if to_addr != contract_addr.lower():
        raise HTTPException(
            status_code=400,
            detail=f"Transaction target {to_addr!r} does not match escrow contract",
        )

    # Derive expected bytes32 contractId and Funded event topic signature
    expected_cid_hex = "0x" + keccak(contract_id.encode("utf-8")).hex()
    funded_topic = "0x" + keccak(b"Funded(bytes32,address,address,uint256,uint256)").hex()
    # USDC has 6 decimals
    expected_amount = int(amount_usdc * 1_000_000)

    for log_entry in result.get("logs", []):
        topics = log_entry.get("topics", [])
        if (
            (log_entry.get("address") or "").lower() == contract_addr.lower()
            and topics
            and topics[0].lower() == funded_topic.lower()
            and len(topics) > 1
            and topics[1].lower() == expected_cid_hex.lower()
        ):
            # Non-indexed data layout (each 32 bytes ABI-encoded):
            # [0:32]  merchant address  [32:64] agent address
            # [64:96] amount (uint256)  [96:128] timestamp (uint256)
            data_hex = (log_entry.get("data") or "0x").removeprefix("0x")
            if len(data_hex) < 192:
                raise HTTPException(status_code=400, detail="Funded event data malformed")
            amount_on_chain = int(data_hex[128:192], 16)
            if abs(amount_on_chain - expected_amount) > 1:
                raise HTTPException(
                    status_code=400,
                    detail=f"Amount mismatch: on-chain {amount_on_chain}, expected ~{expected_amount}",
                )
            return  # verified

    raise HTTPException(
        status_code=400,
        detail="Funded event not found in transaction logs for this contract",
    )


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

def generate_agent_offer(db: Session, contract: PerformanceContract, on_reasoning=None) -> dict:
    log.info("Generating agent offer contract=%s", contract.id)
    _require_status(contract, "Underwriting")

    underwriting = repo.get_underwriting_result(db, contract.id)
    if underwriting is None:
        raise HTTPException(status_code=400, detail="Underwriting result required before generating offer")

    repo.log_audit_event(db, contract.id, "llm_negotiation", "intent", {"contract_id": contract.id})

    result = agent_client.generate_agent_offer(contract.id, on_reasoning=on_reasoning)

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

    _verify_fund_tx_onchain(tx_hash, str(contract.id), amount_usdc)

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

    # Auto-advance: generate strategy in background now that escrow is confirmed
    _bg(_generate_strategy_bg, contract.id)

    return {"escrow_id": record.id, "status": "funded", "tx_hash": tx_hash}


# ── Generate Strategy ─────────────────────────────────────────────────────────

def generate_strategy(db: Session, contract: PerformanceContract, on_reasoning=None) -> dict:
    log.info("Generating strategy contract=%s", contract.id)
    _require_status(contract, "Funded")

    repo.log_audit_event(db, contract.id, "llm_strategy", "intent", {"contract_id": contract.id})

    result = agent_client.generate_strategy(contract.id, on_reasoning=on_reasoning)

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

        # Read merchant's approval_mode to decide execution path
        merchant = repo.get_user_by_id(db, contract.merchant_id)
        approval_mode = getattr(merchant, "approval_mode", "manual") if merchant else "manual"

        # Register 24h monitoring job in the agent's APScheduler — always, regardless of mode
        try:
            agent_client.activate_contract(contract.id)
            log.info("Monitoring job registered contract=%s", contract.id)
        except Exception:
            log.exception("Failed to register monitoring job contract=%s — scheduler will pick it up on next restart", contract.id)

        if approval_mode == "auto":
            # Auto-approve: execute all actions immediately in background
            messages_repo.append(
                db, contract.id, "system", "system_event",
                content="Strategy approved — agent is executing your campaign",
                extra={"plan_id": plan_id},
            )
            _bg(_execute_ads_bg, contract.id)
        else:
            # Manual: post one approval_request card per planned action
            messages_repo.append(
                db, contract.id, "system", "system_event",
                content="Strategy approved — confirm each step below before the agent acts",
                extra={"plan_id": plan_id},
            )
            for idx, action in enumerate(plan.planned_actions or []):
                messages_repo.append(
                    db, contract.id, "agent", "approval_request",
                    content=f"Action {idx + 1}: {action.get('type', 'ad action')} — {action.get('description', '')}".strip(" —"),
                    extra={"plan_id": plan_id, "action_index": idx, "action": action},
                    status="pending",
                )
            log.info("Manual mode: posted %d per-action approval cards contract=%s", len(plan.planned_actions or []), contract.id)

        return {"status": "Active", "plan_id": plan_id, "approval_status": "approved", "approval_mode": approval_mode}
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

    # Mirror settlement outcome on the EscrowRecord so the frontend can read
    # both fund_tx_hash and settlement_tx_hash from a single escrow GET
    escrow = repo.get_escrow_record(db, contract.id)
    if escrow:
        escrow_status = "released" if result["outcome"] == "success" else "refunded"
        repo.update_escrow_status(
            db, escrow.id,
            status=escrow_status,
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
