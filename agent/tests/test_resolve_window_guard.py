"""Tests for item #12 — server-side `evaluation_window_complete` guard.

POST /agent/resolve was previously willing to run the deterministic resolution
engine + on-chain settlement whenever the contract was in `Resolving` state,
even if the evaluation window hadn't closed yet. An attacker (with C1 closed
by #85, this is now defense-in-depth) could otherwise force a refund outcome.

Now: if `window_complete` is False and `RESOLVE_ALLOW_PREMATURE` is False,
the endpoint returns 422 before touching the orchestrator.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from agent.routes import agent as agent_routes


def _fake_contract(window_end: datetime | None, status: str = "Resolving"):
    return SimpleNamespace(
        id="contract-w1",
        status=status,
        target_roas=2.0,
        minimum_spend=500.0,
        window_end=window_end,
    )


def _request_body(contract_id="contract-w1"):
    return agent_routes.ContractRequest(contract_id=contract_id)


def _stub_snapshot():
    return {"spend": 100.0, "revenue": 200.0, "roas": 2.0}


def _patch_resolve_deps(monkeypatch, contract, snapshot):
    monkeypatch.setattr(agent_routes, "_get_contract_or_404", lambda *_a, **_k: contract)

    class _Audit:
        def __init__(self, _db): pass
        def get_latest_snapshot(self, _cid): return snapshot

    monkeypatch.setattr("agent.db.audit_logger.AuditLogger", _Audit)


def test_premature_resolve_is_blocked_by_default(monkeypatch):
    """Window still open + RESOLVE_ALLOW_PREMATURE=False → 422."""
    future = datetime.now(timezone.utc) + timedelta(days=3)
    contract = _fake_contract(window_end=future)
    _patch_resolve_deps(monkeypatch, contract, _stub_snapshot())

    monkeypatch.setattr(
        agent_routes, "orchestrator",
        MagicMock(resolve=MagicMock(side_effect=AssertionError("must not be called"))),
    )
    # Patch the settings instance the route actually uses (routes/agent.py
    # imports it at module level, distinct from `agent.config.settings`).
    monkeypatch.setattr(agent_routes.settings, "RESOLVE_ALLOW_PREMATURE", False)

    from fastapi import HTTPException
    with pytest.raises(HTTPException) as info:
        agent_routes.resolve(_request_body(), db=MagicMock())
    assert info.value.status_code == 422
    assert "Evaluation window has not yet closed" in info.value.detail


def test_premature_resolve_allowed_when_flag_is_true(monkeypatch):
    """Window still open + RESOLVE_ALLOW_PREMATURE=True → bypasses guard."""
    future = datetime.now(timezone.utc) + timedelta(days=3)
    contract = _fake_contract(window_end=future)
    _patch_resolve_deps(monkeypatch, contract, _stub_snapshot())

    fake_result = SimpleNamespace(
        outcome="failure", final_spend=100.0, final_revenue=200.0, final_roas=2.0,
        threshold=2.0, minimum_spend_met=False, target_met=True,
    )
    monkeypatch.setattr(
        agent_routes, "orchestrator",
        MagicMock(resolve=MagicMock(return_value=fake_result)),
    )
    monkeypatch.setattr(agent_routes.settings, "RESOLVE_ALLOW_PREMATURE", True)

    resp = agent_routes.resolve(_request_body(), db=MagicMock())
    assert resp.outcome == "failure"


def test_completed_window_passes_through(monkeypatch):
    """Window closed (window_end in past) → guard accepts; resolution runs."""
    past = datetime.now(timezone.utc) - timedelta(days=1)
    contract = _fake_contract(window_end=past)
    _patch_resolve_deps(monkeypatch, contract, _stub_snapshot())

    fake_result = SimpleNamespace(
        outcome="success", final_spend=100.0, final_revenue=200.0, final_roas=2.0,
        threshold=2.0, minimum_spend_met=True, target_met=True,
    )
    monkeypatch.setattr(
        agent_routes, "orchestrator",
        MagicMock(resolve=MagicMock(return_value=fake_result)),
    )
    monkeypatch.setattr(agent_routes.settings, "RESOLVE_ALLOW_PREMATURE", False)

    resp = agent_routes.resolve(_request_body(), db=MagicMock())
    assert resp.outcome == "success"
