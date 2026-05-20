"""
Tests for the security-hardening batch (review batch 1):
- C-1: _verify_fund_tx_onchain fails closed outside development
- H-1: /docs and /redoc are hidden outside development
- M-1: /resolve has a rate limit (smoke test only — slowapi quotas can be flaky)
"""
from fastapi.testclient import TestClient

from services.contract_service import _verify_fund_tx_onchain


# ── C-1 ─────────────────────────────────────────────────────────────────────

def test_verify_fund_tx_skips_silently_in_development(monkeypatch, caplog):
    monkeypatch.setattr("config.settings.arc_rpc_url", "")
    monkeypatch.setattr("config.settings.escrow_contract_address", "")
    monkeypatch.setattr("config.settings.environment", "development")
    # No exception, no return value
    assert _verify_fund_tx_onchain("0xabc", "contract-id", 100.0) is None


def test_verify_fund_tx_fails_closed_in_test_env(monkeypatch):
    monkeypatch.setattr("config.settings.arc_rpc_url", "")
    monkeypatch.setattr("config.settings.escrow_contract_address", "")
    monkeypatch.setattr("config.settings.environment", "test")
    import pytest
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc:
        _verify_fund_tx_onchain("0xabc", "contract-id", 100.0)
    assert exc.value.status_code == 503
    assert "not configured" in exc.value.detail.lower()


def test_verify_fund_tx_fails_closed_in_production(monkeypatch):
    monkeypatch.setattr("config.settings.arc_rpc_url", "")
    monkeypatch.setattr("config.settings.escrow_contract_address", "")
    monkeypatch.setattr("config.settings.environment", "production")
    import pytest
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc:
        _verify_fund_tx_onchain("0xabc", "contract-id", 100.0)
    assert exc.value.status_code == 503


# ── H-1 ─────────────────────────────────────────────────────────────────────

def test_docs_hidden_in_test_env(client):
    """test env (which is what conftest uses) is not 'development', so /docs is off."""
    res = client.get("/docs")
    assert res.status_code == 404
    res = client.get("/redoc")
    assert res.status_code == 404
    res = client.get("/openapi.json")
    assert res.status_code == 404


# ── M-1 ─────────────────────────────────────────────────────────────────────

def test_resolve_route_has_rate_limit_decorator():
    """Smoke check via route inspection — exercising the actual rate limit is flaky."""
    from main import app
    from limiter import limiter

    resolve_route = next(
        (r for r in app.router.routes if getattr(r, "path", "") == "/api/contracts/{contract_id}/resolve"),
        None,
    )
    assert resolve_route is not None
    # slowapi marks limited endpoints via attribute set by the @limiter.limit decorator
    endpoint = resolve_route.endpoint
    # The limiter attaches its hooks in __wrapped__ chain; the simplest detect is to
    # check that slowapi knows about it.
    assert any("resolve" in name for name in (limiter._route_limits or {}))
