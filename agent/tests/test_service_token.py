"""Tests for ticket #85 — service-token auth on inbound /agent/* routes.

Verifies the four states of the dependency:
  - AGENT_SERVICE_TOKEN unset (rollout grace)         → request passes
  - set + missing header                               → 401
  - set + wrong header                                 → 403
  - set + correct header                               → request passes

We exercise the dependency through a tiny FastAPI app rather than the full
agent app to keep tests fast and free of DB / Anthropic dependencies.
"""
from __future__ import annotations

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from agent.auth import service_token


@pytest.fixture
def client_factory(monkeypatch):
    """Build a TestClient whose protected endpoint enforces verify_service_token."""

    def _build(token_value: str = "") -> TestClient:
        monkeypatch.setattr(service_token.settings, "AGENT_SERVICE_TOKEN", token_value)

        app = FastAPI()

        @app.get("/protected", dependencies=[Depends(service_token.verify_service_token)])
        def protected():
            return {"ok": True}

        return TestClient(app)

    return _build


def test_unset_token_fails_open(client_factory):
    """Rollout grace: when AGENT_SERVICE_TOKEN is empty, all requests pass."""
    client = client_factory(token_value="")
    res = client.get("/protected")
    assert res.status_code == 200
    assert res.json() == {"ok": True}


def test_unset_token_ignores_supplied_header(client_factory):
    client = client_factory(token_value="")
    res = client.get("/protected", headers={"X-Service-Token": "anything"})
    assert res.status_code == 200


def test_set_token_missing_header_returns_401(client_factory):
    client = client_factory(token_value="secret-abc")
    res = client.get("/protected")
    assert res.status_code == 401
    assert "Missing X-Service-Token" in res.json()["detail"]


def test_set_token_wrong_header_returns_403(client_factory):
    client = client_factory(token_value="secret-abc")
    res = client.get("/protected", headers={"X-Service-Token": "secret-xyz"})
    assert res.status_code == 403
    assert "Invalid service token" in res.json()["detail"]


def test_set_token_matching_header_passes(client_factory):
    client = client_factory(token_value="secret-abc")
    res = client.get("/protected", headers={"X-Service-Token": "secret-abc"})
    assert res.status_code == 200


def test_fail_open_disabled_returns_503(client_factory, monkeypatch):
    """When _FAIL_OPEN_WHEN_UNSET is flipped to False, unset token closes the door."""
    monkeypatch.setattr(service_token, "_FAIL_OPEN_WHEN_UNSET", False)
    client = client_factory(token_value="")
    res = client.get("/protected")
    assert res.status_code == 503
    assert "Service token not configured" in res.json()["detail"]


def test_agent_router_is_protected(monkeypatch):
    """Confirm the real agent router carries the dependency (router-level guard).

    We compare by qualified name rather than identity because the agent's source
    files import `from auth.service_token import ...` while the tests import via
    `from agent.auth import ...` — Python loads these as two distinct modules so
    the function objects don't compare equal, even though they're the same code.
    """
    from agent.routes import agent as agent_routes

    dep_names = {
        f"{d.dependency.__module__}.{d.dependency.__qualname__}"
        for d in agent_routes.router.dependencies
    }
    assert any(name.endswith("verify_service_token") for name in dep_names)


def test_chat_router_is_protected():
    from agent.routes import chat as chat_routes

    dep_names = {
        f"{d.dependency.__module__}.{d.dependency.__qualname__}"
        for d in chat_routes.router.dependencies
    }
    assert any(name.endswith("verify_service_token") for name in dep_names)
