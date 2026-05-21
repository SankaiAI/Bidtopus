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
    # No exception, no return value — and the merchant_address arg is still required
    assert _verify_fund_tx_onchain("0xabc", "contract-id", 100.0, "0xMERCHANT") is None


def test_verify_fund_tx_fails_closed_in_test_env(monkeypatch):
    monkeypatch.setattr("config.settings.arc_rpc_url", "")
    monkeypatch.setattr("config.settings.escrow_contract_address", "")
    monkeypatch.setattr("config.settings.environment", "test")
    import pytest
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc:
        _verify_fund_tx_onchain("0xabc", "contract-id", 100.0, "0xMERCHANT")
    assert exc.value.status_code == 503
    assert "not configured" in exc.value.detail.lower()


def test_verify_fund_tx_fails_closed_in_production(monkeypatch):
    monkeypatch.setattr("config.settings.arc_rpc_url", "")
    monkeypatch.setattr("config.settings.escrow_contract_address", "")
    monkeypatch.setattr("config.settings.environment", "production")
    import pytest
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc:
        _verify_fund_tx_onchain("0xabc", "contract-id", 100.0, "0xMERCHANT")
    assert exc.value.status_code == 503


# ── #88: funder address verification ─────────────────────────────────────────

def _funded_event_log(*, contract_addr: str, contract_id: str, merchant: str, amount: int):
    """Build a JSON-RPC-shaped Funded log entry for monkeypatching the RPC response."""
    from eth_hash.auto import keccak

    cid_topic = "0x" + keccak(contract_id.encode("utf-8")).hex()
    funded_topic = "0x" + keccak(b"Funded(bytes32,address,address,uint256,uint256)").hex()
    # 4 non-indexed 32-byte slots: merchant, agent, amount, timestamp
    merchant_hex = merchant.lower().removeprefix("0x").rjust(64, "0")
    agent_hex = "0x" + "00" * 32          # placeholder
    amount_hex = f"{amount:064x}"
    timestamp_hex = f"{0:064x}"
    data = "0x" + merchant_hex + agent_hex.removeprefix("0x") + amount_hex + timestamp_hex
    return {
        "address": contract_addr,
        "topics": [funded_topic, cid_topic],
        "data": data,
    }


def _stub_receipt(*, contract_addr: str, contract_id: str, merchant: str, amount: int):
    """Returns a fake successful receipt dict for monkeypatching httpx.post."""
    log_entry = _funded_event_log(
        contract_addr=contract_addr, contract_id=contract_id,
        merchant=merchant, amount=amount,
    )
    return {"result": {"status": "0x1", "to": contract_addr, "logs": [log_entry]}}


def test_verify_fund_tx_passes_when_merchant_matches(monkeypatch):
    contract_addr = "0xABCDEF0000000000000000000000000000000000"
    contract_id = "11111111-1111-1111-1111-111111111111"
    merchant = "0x982D86F474dCFEB50A4Ae6cB65841713613bB9E5"

    monkeypatch.setattr("config.settings.arc_rpc_url", "https://rpc.test")
    monkeypatch.setattr("config.settings.escrow_contract_address", contract_addr)
    monkeypatch.setattr("config.settings.environment", "test")

    class FakeResp:
        def raise_for_status(self): pass
        def json(self): return _stub_receipt(
            contract_addr=contract_addr, contract_id=contract_id,
            merchant=merchant, amount=100 * 1_000_000,
        )

    monkeypatch.setattr("httpx.post", lambda *a, **kw: FakeResp())

    _verify_fund_tx_onchain("0xtx", contract_id, 100.0, merchant)


def test_verify_fund_tx_rejects_when_merchant_mismatches(monkeypatch):
    contract_addr = "0xABCDEF0000000000000000000000000000000000"
    contract_id = "22222222-2222-2222-2222-222222222222"
    on_chain = "0xFFffFFffFFFFFFffFFFfFfFFFFffFFFFffFFffFF"
    registered = "0x982D86F474dCFEB50A4Ae6cB65841713613bB9E5"

    monkeypatch.setattr("config.settings.arc_rpc_url", "https://rpc.test")
    monkeypatch.setattr("config.settings.escrow_contract_address", contract_addr)
    monkeypatch.setattr("config.settings.environment", "test")

    class FakeResp:
        def raise_for_status(self): pass
        def json(self): return _stub_receipt(
            contract_addr=contract_addr, contract_id=contract_id,
            merchant=on_chain, amount=100 * 1_000_000,
        )

    monkeypatch.setattr("httpx.post", lambda *a, **kw: FakeResp())

    import pytest
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc:
        _verify_fund_tx_onchain("0xtx", contract_id, 100.0, registered)
    assert exc.value.status_code == 400
    assert on_chain.lower() in exc.value.detail.lower()
    assert registered.lower() in exc.value.detail.lower()


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


# ── L-2: extra-metadata sanitization ───────────────────────────────────────

def test_sanitize_obj_strips_html_recursively():
    from services.contract_service import _sanitize_obj
    payload = {
        "summary": "<script>alert(1)</script>OK",
        "actions": [{"name": "<b>boldname</b>", "params": {"reason": "<i>oops</i>"}}],
        "count": 3,
        "tag": None,
    }
    cleaned = _sanitize_obj(payload)
    assert cleaned["summary"] == "alert(1)OK"
    assert cleaned["actions"][0]["name"] == "boldname"
    assert cleaned["actions"][0]["params"]["reason"] == "oops"
    assert cleaned["count"] == 3        # non-strings pass through
    assert cleaned["tag"] is None


# ── L-4: dev-mock-fund refuses non-dev ─────────────────────────────────────

def test_dev_mock_fund_refuses_outside_development():
    """Smoke test by invoking the script as a subprocess with ENVIRONMENT=test."""
    import os
    import subprocess
    import sys

    env = {**os.environ, "ENVIRONMENT": "test"}
    proc = subprocess.run(
        [sys.executable, "scripts/dev_mock_fund.py", "00000000-0000-0000-0000-000000000000"],
        capture_output=True, text=True, env=env,
    )
    assert proc.returncode == 2
    assert "dev-only" in proc.stderr


# ── H-3: rate-limit key prefers user from JWT ──────────────────────────────

def test_rate_limit_key_uses_jwt_sub_when_bearer_present():
    from limiter import _user_or_ip
    import base64
    import json

    class FakeRequest:
        def __init__(self, headers):
            self.headers = headers
            self.client = type("Client", (), {"host": "1.2.3.4"})()

    # Build a fake JWT with sub=user_xyz (no signature — limiter doesn't verify)
    payload = base64.urlsafe_b64encode(json.dumps({"sub": "user_xyz"}).encode()).rstrip(b"=").decode()
    fake_jwt = f"eyJ0.{payload}.sig"
    req = FakeRequest({"Authorization": f"Bearer {fake_jwt}"})

    key = _user_or_ip(req)
    assert key == "user:user_xyz"


def test_rate_limit_key_falls_back_to_ip_when_no_bearer():
    from limiter import _user_or_ip

    class FakeRequest:
        def __init__(self):
            self.headers = {}
            self.client = type("Client", (), {"host": "9.9.9.9"})()

    key = _user_or_ip(FakeRequest())
    assert key.startswith("ip:")


def test_rate_limit_key_falls_back_to_ip_on_malformed_token():
    from limiter import _user_or_ip

    class FakeRequest:
        def __init__(self, headers):
            self.headers = headers
            self.client = type("Client", (), {"host": "1.1.1.1"})()

    req = FakeRequest({"Authorization": "Bearer not-a-jwt"})
    key = _user_or_ip(req)
    assert key.startswith("ip:")
