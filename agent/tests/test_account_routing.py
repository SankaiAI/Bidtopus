"""Tests for ticket #78 — multi-account Meta Ads routing through execute_action.

After backend #76 landed, every contract has its own meta_ads_account_id FK.
execute_action must thread that account through to the Meta Ads MCP call so
merchants with multiple connected ad accounts execute against the right one.
"""
from __future__ import annotations

import inspect

import pytest

from agent.adapters.base import MetaAdsAdapterBase
from agent.adapters.meta_ads import MockMetaAdsAdapter
from agent.models.types import StrategyAction


def test_abstract_execute_action_requires_account_id():
    sig = inspect.signature(MetaAdsAdapterBase.execute_action)
    assert "account_id" in sig.parameters, (
        "MetaAdsAdapterBase.execute_action must accept account_id "
        "(ticket #78 — multi-account routing)"
    )


def test_mock_execute_action_echoes_account_id():
    adapter = MockMetaAdsAdapter()
    action = StrategyAction(
        type="set_budget",
        params={"daily_budget_usd": 100.0},
    )
    result = adapter.execute_action(
        contract_id="contract-001",
        action=action,
        account_id="act_AAA111",
    )
    assert result["status"] == "success"
    assert result["account_id"] == "act_AAA111"


def test_mock_execute_action_routes_distinct_accounts():
    """Two contracts owned by the same merchant must execute against distinct accounts."""
    adapter = MockMetaAdsAdapter()
    action = StrategyAction(type="create_campaign", params={"objective": "sales"})

    a = adapter.execute_action("c-1", action, account_id="act_AAA111")
    b = adapter.execute_action("c-2", action, account_id="act_BBB222")
    assert a["account_id"] != b["account_id"]


def test_execute_action_positional_call_fails_without_account_id():
    """Old call sites that pass only (contract_id, action) must break loudly."""
    adapter = MockMetaAdsAdapter()
    action = StrategyAction(type="pause_ad_set", params={"reason": "test"})
    with pytest.raises(TypeError):
        adapter.execute_action("contract-001", action)  # type: ignore[call-arg]


def test_orchestrator_threads_account_id_to_adapter(monkeypatch):
    """orchestrator.execute_ads_actions must pass account_id into the adapter call."""
    from agent import orchestrator as orch

    captured: dict = {}

    class _StubAdapter:
        def execute_action(self, contract_id, action, account_id):
            captured.update(
                contract_id=contract_id, action=action, account_id=account_id
            )
            return {"status": "success", "account_id": account_id}

    monkeypatch.setattr(orch, "get_meta_ads_adapter", lambda: _StubAdapter())

    class _Row:
        approval_status = "approved"
        planned_actions = [{"type": "set_budget", "params": {"daily_budget_usd": 50}}]

    class _DB:
        def execute(self, *_args, **_kwargs):
            class _Result:
                @staticmethod
                def fetchone():
                    return _Row()
            return _Result()

    # Stub the audit logger so we don't touch the real DB
    class _Audit:
        def __init__(self, _db):
            pass

        def log(self, *args, **kwargs):
            pass

    monkeypatch.setattr(orch, "AuditLogger", _Audit)

    orch.execute_ads_actions(
        contract_id="contract-99",
        contract_status="Active",
        account_id="act_ROUTE_OK",
        db=_DB(),
    )
    assert captured["account_id"] == "act_ROUTE_OK"
    assert captured["contract_id"] == "contract-99"
