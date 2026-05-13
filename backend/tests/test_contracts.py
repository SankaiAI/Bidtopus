"""
Contract creation and listing.
Verifies the response shape matches the API contract agreed with frontend (ticket #1).
"""
from tests.conftest import CONTRACT_PAYLOAD


def test_create_contract_returns_201(client):
    res = client.post("/api/contracts", json=CONTRACT_PAYLOAD)
    assert res.status_code == 201


def test_create_contract_response_shape(client):
    """Response must match the shape committed to frontend in ticket #1."""
    res = client.post("/api/contracts", json=CONTRACT_PAYLOAD)
    body = res.json()

    assert "id" in body
    assert "merchant_id" in body
    assert body["status"] == "Created"
    assert body["target_roas"] == CONTRACT_PAYLOAD["target_roas"]
    assert body["min_spend_usd"] == CONTRACT_PAYLOAD["min_spend_usd"]
    assert body["time_window_days"] == CONTRACT_PAYLOAD["time_window_days"]
    assert body["success_fee_usdc"] == CONTRACT_PAYLOAD["success_fee_usdc"]
    assert body["campaign_mode"] == CONTRACT_PAYLOAD["campaign_mode"]
    assert "created_at" in body


def test_create_contract_status_is_created(client):
    res = client.post("/api/contracts", json=CONTRACT_PAYLOAD)
    assert res.json()["status"] == "Created"


def test_list_contracts_empty_initially(client):
    res = client.get("/api/contracts")
    assert res.status_code == 200
    assert res.json() == []


def test_list_contracts_returns_own(client):
    client.post("/api/contracts", json=CONTRACT_PAYLOAD)
    client.post("/api/contracts", json=CONTRACT_PAYLOAD)

    res = client.get("/api/contracts")
    assert res.status_code == 200
    assert len(res.json()) == 2


def test_get_contract_by_id(client):
    created = client.post("/api/contracts", json=CONTRACT_PAYLOAD).json()
    res = client.get(f"/api/contracts/{created['id']}")
    assert res.status_code == 200
    assert res.json()["id"] == created["id"]


def test_get_nonexistent_contract_returns_404(client):
    res = client.get("/api/contracts/does-not-exist")
    assert res.status_code == 404
