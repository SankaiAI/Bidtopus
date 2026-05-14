"""Tests for the deterministic resolution engine.

These tests must never flake — the resolution engine is pure logic.
If any test here fails, it is a regression in the settlement logic.
"""
import pytest

from agent.engine.resolution import ResolutionEngine
from agent.models.types import ResolutionInput


@pytest.fixture
def engine():
    return ResolutionEngine()


def _make_input(**overrides) -> ResolutionInput:
    base = dict(
        contract_id="test-001",
        final_spend=550.0,
        final_revenue=1232.0,
        final_roas=2.24,
        target_roas=2.0,
        minimum_spend=500.0,
        evaluation_window_complete=True,
    )
    base.update(overrides)
    return ResolutionInput(**base)


class TestSuccessScenarios:
    def test_all_conditions_met_is_success(self, engine):
        result = engine.resolve(_make_input())
        assert result.outcome == "success"
        assert result.target_met is True
        assert result.minimum_spend_met is True

    def test_roas_exactly_at_threshold_is_success(self, engine):
        result = engine.resolve(_make_input(final_roas=2.0, target_roas=2.0))
        assert result.outcome == "success"
        assert result.target_met is True

    def test_spend_exactly_at_minimum_is_success(self, engine):
        result = engine.resolve(_make_input(final_spend=500.0, minimum_spend=500.0))
        assert result.outcome == "success"
        assert result.minimum_spend_met is True


class TestFailureScenarios:
    def test_roas_below_target_is_failure(self, engine):
        result = engine.resolve(_make_input(final_roas=1.8, target_roas=2.0))
        assert result.outcome == "failure"
        assert result.target_met is False

    def test_spend_below_minimum_is_failure(self, engine):
        result = engine.resolve(_make_input(final_spend=400.0, minimum_spend=500.0))
        assert result.outcome == "failure"
        assert result.minimum_spend_met is False

    def test_window_not_complete_is_failure(self, engine):
        result = engine.resolve(_make_input(evaluation_window_complete=False))
        assert result.outcome == "failure"
        assert result.evaluation_window_complete is False

    def test_all_conditions_fail_is_failure(self, engine):
        result = engine.resolve(_make_input(
            final_roas=1.5,
            target_roas=2.0,
            final_spend=300.0,
            minimum_spend=500.0,
            evaluation_window_complete=False,
        ))
        assert result.outcome == "failure"
        assert result.target_met is False
        assert result.minimum_spend_met is False

    def test_roas_just_below_threshold_is_failure(self, engine):
        result = engine.resolve(_make_input(final_roas=1.999, target_roas=2.0))
        assert result.outcome == "failure"


class TestOutputFields:
    def test_result_preserves_all_inputs(self, engine):
        inp = _make_input(final_roas=2.5, final_spend=600.0, final_revenue=1500.0)
        result = engine.resolve(inp)
        assert result.final_roas == 2.5
        assert result.final_spend == 600.0
        assert result.final_revenue == 1500.0
        assert result.threshold == 2.0
        assert result.minimum_spend == 500.0
