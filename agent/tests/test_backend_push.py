"""Tests for ticket #80 — agent → backend performance snapshot push.

The agent's monitoring tick fetches a Meta Ads snapshot and POSTs it to
`/api/contracts/:id/performance` so the merchant's Live Performance card has
something to render. These tests stub httpx so no real network is touched.
"""
from __future__ import annotations

import httpx
import pytest

from agent import backend_client


@pytest.fixture(autouse=True)
def _configure_settings(monkeypatch):
    # backend_client imports `from config import settings`, which is a different
    # module object than `agent.config.settings` (Python caches imports by full
    # dotted name). Patch the one the SUT actually uses.
    monkeypatch.setattr(backend_client.settings, "BACKEND_BASE_URL", "http://backend.test")
    monkeypatch.setattr(backend_client.settings, "AGENT_SERVICE_TOKEN", "test-token-123")


def _stub_post(monkeypatch, *, status_code: int = 201, json_payload: dict | None = None):
    """Patch httpx.post to capture the call and return a canned response."""
    calls: list[dict] = []

    def fake_post(url, json=None, headers=None, timeout=None):  # noqa: A002
        calls.append({"url": url, "json": json, "headers": headers, "timeout": timeout})
        return httpx.Response(
            status_code=status_code,
            json=json_payload or {"id": "snap-1", "timestamp": "2026-05-20T00:00:00Z"},
            request=httpx.Request("POST", url),
        )

    monkeypatch.setattr(backend_client.httpx, "post", fake_post)
    return calls


def test_push_performance_targets_correct_url(monkeypatch):
    calls = _stub_post(monkeypatch)
    backend_client.push_performance(
        "contract-42",
        spend=100.0,
        revenue=250.0,
        roas=2.5,
        success_probability=0.78,
    )
    assert calls[0]["url"] == "http://backend.test/api/contracts/contract-42/performance"


def test_push_performance_sends_service_token(monkeypatch):
    calls = _stub_post(monkeypatch)
    backend_client.push_performance(
        "contract-42",
        spend=100.0,
        revenue=250.0,
        roas=2.5,
        success_probability=0.78,
    )
    assert calls[0]["headers"]["X-Service-Token"] == "test-token-123"


def test_push_performance_body_shape(monkeypatch):
    calls = _stub_post(monkeypatch)
    backend_client.push_performance(
        "contract-42",
        spend=100.0,
        revenue=250.0,
        roas=2.5,
        success_probability=0.78,
    )
    body = calls[0]["json"]
    assert body == {
        "spend": 100.0,
        "revenue": 250.0,
        "roas": 2.5,
        "success_probability": 0.78,
        "timestamp": None,
    }


def test_push_performance_inactive_contract_returns_none(monkeypatch):
    """Backend signals a dropped snapshot with 202 — push_performance returns None."""
    _stub_post(monkeypatch, status_code=202, json_payload={})
    result = backend_client.push_performance(
        "contract-42",
        spend=10.0,
        revenue=20.0,
        roas=2.0,
        success_probability=0.5,
    )
    assert result is None


def test_push_performance_raises_on_5xx(monkeypatch):
    _stub_post(monkeypatch, status_code=503, json_payload={"detail": "unavailable"})
    with pytest.raises(httpx.HTTPStatusError):
        backend_client.push_performance(
            "contract-42",
            spend=10.0,
            revenue=20.0,
            roas=2.0,
            success_probability=0.5,
        )


def test_monitoring_tick_swallows_push_errors(monkeypatch):
    """A backend push failure must not abort the rest of run_monitoring_tick."""
    from agent import orchestrator as orch

    snapshot = {"spend": 10.0, "revenue": 25.0, "roas": 2.5}
    forecast = {"success_probability": 0.7}

    monkeypatch.setattr(
        orch, "get_performance",
        lambda **_kwargs: {"snapshot": snapshot, "forecast": forecast},
    )

    def _raising_push(*_args, **_kwargs):
        raise httpx.ConnectError("backend down")

    monkeypatch.setattr(orch.backend_client, "push_performance", _raising_push)

    result = orch.run_monitoring_tick(
        contract_id="contract-7",
        day=3,
        target_roas=2.0,
        minimum_spend=500.0,
        days_elapsed=3,
        days_remaining=4,
        evaluation_window_complete=False,
        db=None,
    )
    assert result["snapshot"] == snapshot


def test_monitoring_tick_pushes_snapshot(monkeypatch):
    """When the push succeeds, run_monitoring_tick calls push_performance with the snapshot."""
    from agent import orchestrator as orch

    snapshot = {"spend": 12.0, "revenue": 30.0, "roas": 2.5}
    forecast = {"success_probability": 0.81}

    monkeypatch.setattr(
        orch, "get_performance",
        lambda **_kwargs: {"snapshot": snapshot, "forecast": forecast},
    )

    captured: dict = {}

    def _capture(contract_id, **kwargs):
        captured["contract_id"] = contract_id
        captured.update(kwargs)
        return {"id": "snap-1"}

    monkeypatch.setattr(orch.backend_client, "push_performance", _capture)

    orch.run_monitoring_tick(
        contract_id="contract-7",
        day=3,
        target_roas=2.0,
        minimum_spend=500.0,
        days_elapsed=3,
        days_remaining=4,
        evaluation_window_complete=False,
        db=None,
    )
    assert captured["contract_id"] == "contract-7"
    assert captured["spend"] == 12.0
    assert captured["revenue"] == 30.0
    assert captured["roas"] == 2.5
    assert captured["success_probability"] == 0.81
