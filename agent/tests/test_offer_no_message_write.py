"""Regression test for ticket #83 — duplicate agent acceptance bubble.

The orchestrator's `generate_offer` / `stream_offer` must NOT write the offer
text to `contract_messages`. The backend handles that write after the agent's
HTTP response returns (it needs to attach the `offer_id` it just minted).
Writing here too produces a duplicate bubble on workspace restore.

The turn-limit auto-reject path is the one exception — it raises before the
backend has a chance to write, so it persists its own rejection message.
"""
from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from agent import orchestrator as orch
from agent.config import settings
from agent.models.types import (
    AgentOffer,
    ContractTerms,
    UnderwritingResult,
)

# Pull NegotiationLimitError from the SAME import path the orchestrator uses,
# not via `from agent.exceptions import ...`. The two paths resolve to different
# class objects (Python caches `agent.exceptions` and `exceptions` separately)
# so `pytest.raises(agent.exceptions.NegotiationLimitError)` doesn't catch what
# `from exceptions import NegotiationLimitError` actually raises.
NegotiationLimitError = orch.NegotiationLimitError


@pytest.fixture
def terms() -> ContractTerms:
    return ContractTerms(
        contract_id="contract-83",
        requested_target_roas=2.0,
        minimum_spend=500.0,
        time_window_days=7,
        success_fee_usdc=100.0,
        campaign_type="optimize",
        campaign_goal="boost summer collection",
    )


@pytest.fixture
def underwriting() -> UnderwritingResult:
    return UnderwritingResult(
        success_probability=0.72,
        risk_level="medium",
        expected_roas_range=(1.8, 2.4),
        recommendation="accept",
        recommended_fee_usdc=120.0,
    )


def _patch_repos(monkeypatch):
    audit_calls: list[tuple] = []
    message_calls: list[tuple] = []

    class _StubAudit:
        def __init__(self, _db):
            pass
        def log(self, *args, **kwargs):
            audit_calls.append((args, kwargs))

    class _StubMessages:
        def __init__(self, _db):
            pass
        def append(self, *args, **kwargs):
            message_calls.append((args, kwargs))

    monkeypatch.setattr(orch, "AuditLogger", _StubAudit)
    monkeypatch.setattr(orch, "MessagesRepo", _StubMessages)
    return audit_calls, message_calls


def _stub_negotiation(monkeypatch, offer: AgentOffer):
    layer = MagicMock()
    layer.generate_offer.return_value = (offer, None)
    monkeypatch.setattr(orch, "_get_negotiation_layer", lambda: layer)


def test_accept_offer_does_not_write_message(monkeypatch, terms, underwriting):
    audit_calls, message_calls = _patch_repos(monkeypatch)
    _stub_negotiation(monkeypatch, AgentOffer(
        offer_type="accept",
        message="Great news — we're pleased to accept.",
        revised_threshold=None,
        revised_fee_usdc=None,
        revised_time_window_days=None,
    ))

    orch.generate_offer(
        contract_id="contract-83",
        contract_terms=terms,
        underwriting_result=underwriting,
        contract_status="Underwriting",
        turn_count=0,
        db=MagicMock(),
    )

    assert message_calls == [], (
        "generate_offer must not write to contract_messages on accept — "
        "backend persists the offer with the minted offer_id (#83)"
    )
    # Audit log is still the canonical internal record.
    assert any(call[0][1] == "llm_negotiation" for call in audit_calls)


def test_counter_offer_does_not_write_message(monkeypatch, terms, underwriting):
    _, message_calls = _patch_repos(monkeypatch)
    _stub_negotiation(monkeypatch, AgentOffer(
        offer_type="counteroffer",
        message="I'd like to counter at 1.8x ROAS.",
        revised_threshold=1.8,
        revised_fee_usdc=110.0,
        revised_time_window_days=10,
    ))

    orch.generate_offer(
        contract_id="contract-83",
        contract_terms=terms,
        underwriting_result=underwriting,
        contract_status="Underwriting",
        turn_count=0,
        db=MagicMock(),
    )

    assert message_calls == [], "counter offers must not be written to contract_messages (#83)"


def test_reject_offer_does_not_write_message(monkeypatch, terms, underwriting):
    """LLM-returned rejection (not turn-limit) — backend still writes it."""
    _, message_calls = _patch_repos(monkeypatch)
    _stub_negotiation(monkeypatch, AgentOffer(
        offer_type="reject",
        message="Unable to underwrite at these terms.",
        revised_threshold=None,
        revised_fee_usdc=None,
        revised_time_window_days=None,
    ))

    orch.generate_offer(
        contract_id="contract-83",
        contract_terms=terms,
        underwriting_result=underwriting,
        contract_status="Underwriting",
        turn_count=0,
        db=MagicMock(),
    )

    assert message_calls == [], "LLM reject offers go through the same backend write path (#83)"


def test_turn_limit_reject_still_writes_message(monkeypatch, terms, underwriting):
    """Turn-limit auto-reject raises before backend gets to write — it must persist itself."""
    audit_calls, message_calls = _patch_repos(monkeypatch)

    with pytest.raises(NegotiationLimitError):
        orch.generate_offer(
            contract_id="contract-83",
            contract_terms=terms,
            underwriting_result=underwriting,
            contract_status="Underwriting",
            turn_count=settings.MAX_NEGOTIATION_TURNS,
            db=MagicMock(),
        )

    assert len(message_calls) == 1, (
        "turn-limit auto-reject must still write the rejection bubble — "
        "the orchestrator raises before backend can persist it"
    )
    _, kwargs = message_calls[0]
    assert kwargs.get("type") == "message"
    assert kwargs.get("metadata", {}).get("reason") == "turn_limit_reached"
