"""
Ownership enforcement — Merchant B must never touch Merchant A's contract.
Every /contracts/:id/* endpoint must return 403 for the wrong user.
"""
import pytest
from db.models import PerformanceContract


@pytest.fixture
def other_contract(db, other_user):
    """A contract owned by other_user, not test_user."""
    c = PerformanceContract(
        merchant_id=other_user.id,
        threshold=2.0,
        minimum_spend=500.0,
        time_window_days=7,
        success_fee_usdc=100.0,
        campaign_mode="optimize_existing",
        status="Created",
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


def test_get_contract_forbidden_for_wrong_user(client, other_contract):
    res = client.get(f"/api/contracts/{other_contract.id}")
    assert res.status_code == 403


def test_underwrite_forbidden_for_wrong_user(client, other_contract):
    res = client.post(f"/api/contracts/{other_contract.id}/underwrite")
    assert res.status_code == 403


def test_agent_offer_forbidden_for_wrong_user(client, other_contract):
    res = client.post(f"/api/contracts/{other_contract.id}/agent-offer")
    assert res.status_code == 403


def test_accept_forbidden_for_wrong_user(client, other_contract):
    res = client.post(f"/api/contracts/{other_contract.id}/accept",
                      json={"offer_id": "fake"})
    assert res.status_code == 403


def test_fund_escrow_forbidden_for_wrong_user(client, other_contract):
    res = client.post(f"/api/contracts/{other_contract.id}/fund-escrow", json={
        "tx_hash": "0xabc", "chain_contract_id": "0x123", "amount_usdc": 100.0,
    })
    assert res.status_code == 403


def test_generate_strategy_forbidden_for_wrong_user(client, other_contract):
    res = client.post(f"/api/contracts/{other_contract.id}/generate-strategy")
    assert res.status_code == 403


def test_approve_execution_forbidden_for_wrong_user(client, other_contract):
    res = client.post(f"/api/contracts/{other_contract.id}/approve-execution",
                      json={"plan_id": "fake", "approved": True})
    assert res.status_code == 403


def test_execute_ads_forbidden_for_wrong_user(client, other_contract):
    res = client.post(f"/api/contracts/{other_contract.id}/execute-ads-actions")
    assert res.status_code == 403


def test_performance_forbidden_for_wrong_user(client, other_contract):
    res = client.get(f"/api/contracts/{other_contract.id}/performance")
    assert res.status_code == 403


def test_resolve_forbidden_for_wrong_user(client, other_contract):
    res = client.post(f"/api/contracts/{other_contract.id}/resolve")
    assert res.status_code == 403


def test_messages_forbidden_for_wrong_user(client, other_contract):
    res = client.get(f"/api/contracts/{other_contract.id}/messages")
    assert res.status_code == 403


def test_delete_forbidden_for_wrong_user(client, other_contract):
    res = client.delete(f"/api/contracts/{other_contract.id}")
    assert res.status_code == 403


def test_delete_returns_204_for_missing_contract(client):
    """DELETE is idempotent — already-gone resource is the desired end state, so 204."""
    res = client.delete("/api/contracts/00000000-0000-0000-0000-nonexistent")
    assert res.status_code == 204


def test_delete_returns_204_and_removes_contract(client, db, contract_in_state):
    from db.models import PerformanceContract, ContractMessage
    c = contract_in_state("Created")
    msg = ContractMessage(
        contract_id=c.id, role="agent", type="info", content="hello"
    )
    db.add(msg)
    db.commit()

    res = client.delete(f"/api/contracts/{c.id}")
    assert res.status_code == 204

    assert db.query(PerformanceContract).filter_by(id=c.id).first() is None
    assert db.query(ContractMessage).filter_by(contract_id=c.id).count() == 0


def test_owner_can_access_own_contract(client, contract_in_state):
    """Sanity check: the owner can always read their own contract."""
    c = contract_in_state("Created")
    res = client.get(f"/api/contracts/{c.id}")
    assert res.status_code == 200
