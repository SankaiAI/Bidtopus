"""
Resolution idempotency — calling /resolve twice must return the same result
and must NOT call the agent a second time.
Network retries and double-clicks must be safe.
"""
from unittest.mock import patch, MagicMock
from db.models import ResolutionRecord


MOCK_RESOLUTION = {
    "final_spend": 480.0,
    "final_revenue": 1100.0,
    "final_roas": 2.29,
    "outcome": "success",
    "settlement_tx_hash": "0xdeadbeef1234",
}


def test_resolve_idempotent(client, contract_in_state):
    """Second call to /resolve returns the stored result without calling the agent again."""
    # Need an Active contract whose evaluation window has already closed.
    # Set funded_at far in the past so the window check passes.
    from datetime import datetime, timezone, timedelta
    c = contract_in_state(
        "Active",
        funded_at=datetime.now(timezone.utc) - timedelta(days=30),
    )

    with patch("agent_client.resolve_contract", return_value=MOCK_RESOLUTION) as mock_resolve:
        res1 = client.post(f"/api/contracts/{c.id}/resolve")
        assert res1.status_code == 200
        assert res1.json()["outcome"] == "success"
        assert mock_resolve.call_count == 1

        # Second call — agent must NOT be called again
        res2 = client.post(f"/api/contracts/{c.id}/resolve")
        assert res2.status_code == 200
        assert res2.json()["outcome"] == "success"
        assert mock_resolve.call_count == 1  # still 1, not 2


def test_resolve_returns_same_tx_hash_on_retry(client, contract_in_state):
    """The same settlement_tx_hash is returned on every retry."""
    from datetime import datetime, timezone, timedelta
    c = contract_in_state(
        "Active",
        funded_at=datetime.now(timezone.utc) - timedelta(days=30),
    )

    with patch("agent_client.resolve_contract", return_value=MOCK_RESOLUTION):
        r1 = client.post(f"/api/contracts/{c.id}/resolve").json()
        r2 = client.post(f"/api/contracts/{c.id}/resolve").json()

    assert r1["settlement_tx_hash"] == r2["settlement_tx_hash"]
    assert r1["id"] == r2["id"]


def test_resolve_rejects_open_window(client, contract_in_state):
    """Resolve is rejected when the evaluation window hasn't closed yet."""
    from datetime import datetime, timezone
    c = contract_in_state(
        "Active",
        funded_at=datetime.now(timezone.utc),  # just funded — window still open
    )

    with patch("agent_client.resolve_contract", return_value=MOCK_RESOLUTION):
        res = client.post(f"/api/contracts/{c.id}/resolve")

    assert res.status_code == 400
