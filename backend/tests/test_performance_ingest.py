"""
POST /api/contracts/:id/performance — agent → backend ingest endpoint (issue #79).

Covers: happy 201, missing token 401, wrong token 403, missing service config 503,
non-Active contract 202 graceful drop, missing contract 404.
"""
import pytest
from fastapi.testclient import TestClient

from db.models import PerformanceSnapshot

SERVICE_TOKEN = "test-service-token-shhh"
WRONG_TOKEN = "nope-not-this-one"


@pytest.fixture
def perf_client(db, monkeypatch):
    """
    A TestClient bound to the same db session but without Clerk auth override —
    perf ingest doesn't use Clerk; it uses the X-Service-Token header.
    """
    monkeypatch.setattr("config.settings.agent_service_token", SERVICE_TOKEN)
    from main import app
    from db.session import get_db

    app.dependency_overrides[get_db] = lambda: (yield db)
    # Note: NOT overriding get_current_user — the ingest route doesn't use it
    with TestClient(app, raise_server_exceptions=True) as c:
        yield c
    app.dependency_overrides.clear()


def _post(client, contract_id, **fields):
    headers = {"X-Service-Token": fields.pop("_token", SERVICE_TOKEN)} if fields.pop("_with_token", True) else {}
    body = {"spend": 100.0, "revenue": 350.0, "roas": 3.5, **fields}
    return client.post(f"/api/contracts/{contract_id}/performance", json=body, headers=headers)


# ── Happy path ──────────────────────────────────────────────────────────────

def test_ingest_writes_snapshot_and_returns_201(perf_client, db, contract_in_state):
    c = contract_in_state("Active")
    res = _post(perf_client, c.id, spend=120.5, revenue=480.0, roas=3.98)
    assert res.status_code == 201, res.text
    body = res.json()
    assert "id" in body and "timestamp" in body

    rows = db.query(PerformanceSnapshot).filter_by(contract_id=c.id).all()
    assert len(rows) == 1
    assert rows[0].spend == 120.5
    assert rows[0].revenue == 480.0
    assert rows[0].roas == 3.98


def test_ingest_uses_now_when_timestamp_omitted(perf_client, db, contract_in_state):
    c = contract_in_state("Active")
    res = _post(perf_client, c.id)
    assert res.status_code == 201
    row = db.query(PerformanceSnapshot).filter_by(contract_id=c.id).first()
    assert row.timestamp is not None


# ── Auth ────────────────────────────────────────────────────────────────────

def test_ingest_missing_token_returns_401(perf_client, contract_in_state):
    c = contract_in_state("Active")
    res = perf_client.post(
        f"/api/contracts/{c.id}/performance",
        json={"spend": 1.0, "revenue": 1.0},
    )
    assert res.status_code == 401


def test_ingest_wrong_token_returns_403(perf_client, contract_in_state):
    c = contract_in_state("Active")
    res = _post(perf_client, c.id, _token=WRONG_TOKEN)
    assert res.status_code == 403


def test_ingest_unconfigured_service_returns_503(db, monkeypatch, contract_in_state):
    """When AGENT_SERVICE_TOKEN env var is empty, the endpoint fails closed."""
    monkeypatch.setattr("config.settings.agent_service_token", "")
    from main import app
    from db.session import get_db
    app.dependency_overrides[get_db] = lambda: (yield db)
    try:
        with TestClient(app, raise_server_exceptions=True) as c:
            contract = contract_in_state("Active")
            res = c.post(
                f"/api/contracts/{contract.id}/performance",
                json={"spend": 1.0, "revenue": 1.0},
                headers={"X-Service-Token": "anything"},
            )
            assert res.status_code == 503
    finally:
        app.dependency_overrides.clear()


# ── Graceful drop for non-Active contracts ─────────────────────────────────

@pytest.mark.parametrize("status", ["Created", "Offered", "FundedPending", "Funded", "Settled"])
def test_ingest_non_active_contract_returns_202(perf_client, db, contract_in_state, status):
    c = contract_in_state(status)
    res = _post(perf_client, c.id)
    assert res.status_code == 202
    assert db.query(PerformanceSnapshot).filter_by(contract_id=c.id).count() == 0


# ── Bad contract id ────────────────────────────────────────────────────────

def test_ingest_missing_contract_returns_404(perf_client):
    res = _post(perf_client, "00000000-0000-0000-0000-000000000099")
    assert res.status_code == 404
