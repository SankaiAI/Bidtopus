"""
State gate enforcement — every transition endpoint must reject the wrong state with 400.
These tests bypass the agent entirely; they prove the gate fires before any agent work.
"""
import pytest
from db.models import UnderwritingResult, AgentOffer, StrategyPlan


# ── /underwrite requires Created ─────────────────────────────────────────────

@pytest.mark.parametrize("bad_status", ["Underwriting", "Offered", "Funded", "Active", "Settled"])
def test_underwrite_rejects_wrong_state(client, contract_in_state, bad_status):
    c = contract_in_state(bad_status)
    res = client.post(f"/api/contracts/{c.id}/underwrite")
    assert res.status_code == 400


# ── /agent-offer requires Underwriting + underwriting result ─────────────────

@pytest.mark.parametrize("bad_status", ["Created", "Offered", "Funded", "Active"])
def test_agent_offer_rejects_wrong_state(client, contract_in_state, bad_status):
    c = contract_in_state(bad_status)
    res = client.post(f"/api/contracts/{c.id}/agent-offer")
    assert res.status_code == 400


def test_agent_offer_rejects_missing_underwriting(client, contract_in_state):
    """Status is Underwriting but no underwriting_result row → 400."""
    c = contract_in_state("Underwriting")
    res = client.post(f"/api/contracts/{c.id}/agent-offer")
    assert res.status_code == 400


# ── /accept requires Offered ──────────────────────────────────────────────────

@pytest.mark.parametrize("bad_status", ["Created", "Underwriting", "Funded", "Active"])
def test_accept_rejects_wrong_state(client, contract_in_state, bad_status):
    c = contract_in_state(bad_status)
    res = client.post(f"/api/contracts/{c.id}/accept", json={"offer_id": "fake-offer-id"})
    assert res.status_code == 400


# ── /fund-escrow requires FundedPending ──────────────────────────────────────

@pytest.mark.parametrize("bad_status", ["Created", "Offered", "Funded", "Active"])
def test_fund_escrow_rejects_wrong_state(client, contract_in_state, bad_status):
    c = contract_in_state(bad_status)
    res = client.post(f"/api/contracts/{c.id}/fund-escrow", json={
        "tx_hash": "0xabc",
        "chain_contract_id": "0x123",
        "amount_usdc": 100.0,
    })
    assert res.status_code == 400


def test_fund_escrow_rejects_missing_wallet(client, db, test_user, contract_in_state):
    """User has no wallet_address → 400 even if status is correct."""
    assert test_user.wallet_address is None
    c = contract_in_state("FundedPending")
    res = client.post(f"/api/contracts/{c.id}/fund-escrow", json={
        "tx_hash": "0xabc",
        "chain_contract_id": "0x123",
        "amount_usdc": 100.0,
    })
    assert res.status_code == 400


# ── /generate-strategy requires Funded ───────────────────────────────────────

@pytest.mark.parametrize("bad_status", ["Created", "Underwriting", "Offered", "Active"])
def test_generate_strategy_rejects_wrong_state(client, contract_in_state, bad_status):
    c = contract_in_state(bad_status)
    res = client.post(f"/api/contracts/{c.id}/generate-strategy")
    assert res.status_code == 400


# ── /approve-execution requires pending strategy plan ────────────────────────

def test_approve_execution_rejects_missing_plan(client, contract_in_state):
    """No strategy plan at all → 400."""
    c = contract_in_state("Funded")
    res = client.post(f"/api/contracts/{c.id}/approve-execution",
                      json={"plan_id": "nonexistent", "approved": True})
    assert res.status_code == 400


def test_approve_execution_rejects_already_approved(client, db, contract_in_state):
    """Strategy plan already approved → 400 (can't approve twice)."""
    c = contract_in_state("Active")
    plan = StrategyPlan(
        contract_id=c.id,
        summary="Test plan",
        planned_actions=[],
        approval_status="approved",
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)

    res = client.post(f"/api/contracts/{c.id}/approve-execution",
                      json={"plan_id": plan.id, "approved": True})
    assert res.status_code == 400


# ── get_latest_strategy_plan uses created_at, not approved_at ────────────────

def test_approve_execution_picks_newest_plan_after_decline(client, db, contract_in_state):
    """Regression: declined plan + new pending plan — approve must target the new plan."""
    import time
    c = contract_in_state("Funded")

    old_plan = StrategyPlan(
        contract_id=c.id,
        summary="Old declined plan",
        planned_actions=[],
        approval_status="declined",
    )
    db.add(old_plan)
    db.commit()

    # Small sleep so created_at timestamps differ
    time.sleep(0.01)

    new_plan = StrategyPlan(
        contract_id=c.id,
        summary="New pending plan",
        planned_actions=[],
        approval_status="pending",
    )
    db.add(new_plan)
    db.commit()
    db.refresh(new_plan)

    res = client.post(f"/api/contracts/{c.id}/approve-execution",
                      json={"plan_id": new_plan.id, "approved": True})
    # Should not be 400 "already approved" (which the old sort bug would cause
    # by fetching the wrong plan and then checking its status)
    assert res.status_code != 400 or "already approved" not in res.json().get("detail", "")


# ── /execute-ads-actions requires Active + approved strategy ──────────────────

@pytest.mark.parametrize("bad_status", ["Created", "Funded", "Settled"])
def test_execute_ads_rejects_wrong_state(client, contract_in_state, bad_status):
    c = contract_in_state(bad_status)
    res = client.post(f"/api/contracts/{c.id}/execute-ads-actions")
    assert res.status_code == 400


def test_execute_ads_rejects_unapproved_strategy(client, db, contract_in_state):
    """Status is Active but strategy is pending → 400."""
    c = contract_in_state("Active")
    plan = StrategyPlan(
        contract_id=c.id,
        summary="Test plan",
        planned_actions=[],
        approval_status="pending",
    )
    db.add(plan)
    db.commit()

    res = client.post(f"/api/contracts/{c.id}/execute-ads-actions")
    assert res.status_code == 400


# ── /resolve requires Active ──────────────────────────────────────────────────

@pytest.mark.parametrize("bad_status", ["Created", "Underwriting", "Funded", "Settled"])
def test_resolve_rejects_wrong_state(client, contract_in_state, bad_status):
    c = contract_in_state(bad_status)
    res = client.post(f"/api/contracts/{c.id}/resolve")
    assert res.status_code == 400
