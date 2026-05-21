"""Tests for item #7 — sanitized HTTP error responses.

The agent's exception handlers must return a generic message + correlation_id
to the client and log the full exception details internally only. This stops
Circle API response bodies, transaction IDs, and other internal context from
leaking via HTTPException(detail=str(e)).
"""
from __future__ import annotations

import logging
from unittest.mock import patch

import pytest
from fastapi import HTTPException

from agent.routes import agent as agent_routes
from agent.routes.agent import _handle_agent_error, _sse_error_payload

# Use the SAME exception classes that routes/agent.py imports — Python loads
# `exceptions` (agent's bare import) and `agent.exceptions` (test import) as
# distinct modules, so the class objects don't compare equal via isinstance.
SafeAgentError = agent_routes.SafeAgentError
AdapterError = agent_routes.AdapterError


def _detail_to_dict(exc: HTTPException) -> dict:
    """HTTPException.detail is a dict here; older str form would fail this."""
    assert isinstance(exc.detail, dict), f"expected dict detail, got {type(exc.detail)}"
    return exc.detail


def test_safe_agent_error_returns_generic_422():
    err = SafeAgentError("internal contract state X with secret Y")
    with pytest.raises(HTTPException) as info:
        _handle_agent_error(err, contract_id="contract-1")
    assert info.value.status_code == 422
    body = _detail_to_dict(info.value)
    assert "secret" not in body["message"].lower()
    assert "internal contract state" not in body["message"].lower()
    assert len(body["correlation_id"]) == 12


def test_adapter_error_returns_generic_502_not_circle_body():
    err = AdapterError(
        "Circle contract execution failed (400): "
        "{'error': {'code': 'INVALID_WALLET', 'tx_id': 'tx-internal-abc'}}"
    )
    with pytest.raises(HTTPException) as info:
        _handle_agent_error(err, contract_id="contract-1")
    assert info.value.status_code == 502
    body = _detail_to_dict(info.value)
    assert "tx-internal-abc" not in body["message"]
    assert "INVALID_WALLET" not in body["message"]
    assert "Circle" not in body["message"]
    assert len(body["correlation_id"]) == 12


def test_unexpected_error_returns_generic_500():
    err = ValueError("KeyError leaking internal table name: 'strategy_plans'")
    with pytest.raises(HTTPException) as info:
        _handle_agent_error(err, contract_id="contract-1")
    assert info.value.status_code == 500
    body = _detail_to_dict(info.value)
    assert "strategy_plans" not in body["message"]
    assert len(body["correlation_id"]) == 12


def test_sse_error_payload_is_generic_with_correlation_id():
    err = AdapterError("leaky internal text with tx-xyz")
    payload = _sse_error_payload(err, contract_id="contract-1")
    assert payload.startswith("event: error\ndata: ")
    assert "tx-xyz" not in payload
    assert "leaky" not in payload
    assert "correlation_id" in payload


def test_handler_logs_full_exception_internally():
    """Internal logs MUST carry the real exception text so on-call can debug.

    The client-facing redaction is a one-way mirror: full details in our logs,
    generic message + correlation_id out the wire. Attach a capture handler
    directly to the stdlib logger (agent's StreamHandler holds the pre-test
    stdout reference, so neither capsys nor caplog work here).
    """
    captured: list[dict] = []

    class _CaptureHandler(logging.Handler):
        def emit(self, record):
            captured.append({
                "msg": record.getMessage(),
                **{k: v for k, v in record.__dict__.items() if not k.startswith("_")},
            })

    handler = _CaptureHandler(level=logging.ERROR)
    stdlib_logger = logging.getLogger("agent.routes.agent")
    stdlib_logger.addHandler(handler)
    try:
        err = AdapterError("Circle internal err code INVALID_WALLET tx-id=tx-abc")
        with pytest.raises(HTTPException):
            _handle_agent_error(err, contract_id="contract-1")
    finally:
        stdlib_logger.removeHandler(handler)

    assert any("INVALID_WALLET" in str(rec.get("error", "")) for rec in captured), \
        f"expected full error text in agent logs; captured={captured}"
