"""LLM Negotiation Eval Scenarios.

These tests make real API calls — skip in CI unless ANTHROPIC_API_KEY is set.
They verify that the LLM produces correctly-structured offers across 20+ scenarios.

Run with: pytest tests/evals/ -v --tb=short
"""
import os

import pytest

from agent.llm.negotiation import NegotiationLayer
from agent.models.types import AccountContext, ContractTerms, UnderwritingResult

pytestmark = pytest.mark.skipif(
    not os.getenv("ANTHROPIC_API_KEY"),
    reason="ANTHROPIC_API_KEY not set — skipping LLM evals",
)


@pytest.fixture(scope="module")
def negotiation():
    return NegotiationLayer()


def _terms(contract_id: str, roas: float, fee: float = 100.0, days: int = 7, ctype: str = "optimize") -> ContractTerms:
    return ContractTerms(
        contract_id=contract_id,
        requested_target_roas=roas,
        minimum_spend=500.0,
        time_window_days=days,
        success_fee_usdc=fee,
        campaign_type=ctype,
        campaign_goal="Drive e-commerce sales",
    )


def _underwriting(prob: float, recommendation: str, fee: float = 100.0) -> UnderwritingResult:
    return UnderwritingResult(
        success_probability=prob,
        risk_level="low" if prob >= 0.65 else "medium" if prob >= 0.35 else "high",
        expected_roas_range=(1.5, 2.5),
        recommendation=recommendation,
        recommended_fee_usdc=fee,
    )


class TestAcceptScenarios:
    def test_clear_accept_high_probability(self, negotiation):
        offer = negotiation.generate_offer(
            _terms("eval-accept-01", roas=2.0),
            _underwriting(0.80, "accept"),
        )
        assert offer.offer_type == "accept"
        assert offer.revised_threshold is None
        assert offer.revised_fee_usdc is None
        assert offer.revised_time_window_days is None
        assert len(offer.message) > 10

    def test_accept_borderline_high_probability(self, negotiation):
        offer = negotiation.generate_offer(
            _terms("eval-accept-02", roas=1.8),
            _underwriting(0.66, "accept"),
        )
        assert offer.offer_type == "accept"

    def test_accept_longer_window(self, negotiation):
        offer = negotiation.generate_offer(
            _terms("eval-accept-03", roas=2.5, days=30),
            _underwriting(0.72, "accept"),
        )
        assert offer.offer_type == "accept"


class TestCounterOfferScenarios:
    def test_counteroffer_medium_probability(self, negotiation):
        offer = negotiation.generate_offer(
            _terms("eval-counter-01", roas=3.0),
            _underwriting(0.45, "counteroffer"),
        )
        assert offer.offer_type == "counteroffer"
        # Must propose at least one revised term
        has_revision = any([
            offer.revised_threshold is not None,
            offer.revised_fee_usdc is not None,
            offer.revised_time_window_days is not None,
        ])
        assert has_revision

    def test_counteroffer_proposes_lower_roas(self, negotiation):
        offer = negotiation.generate_offer(
            _terms("eval-counter-02", roas=3.5),
            _underwriting(0.40, "counteroffer", fee=120.0),
        )
        assert offer.offer_type == "counteroffer"
        if offer.revised_threshold is not None:
            assert offer.revised_threshold <= 3.5  # must not make it harder

    def test_counteroffer_higher_fee_for_risky_contract(self, negotiation):
        offer = negotiation.generate_offer(
            _terms("eval-counter-03", roas=2.8, fee=80.0),
            _underwriting(0.50, "counteroffer", fee=128.0),
        )
        assert offer.offer_type in ("counteroffer", "reject")
        if offer.offer_type == "counteroffer" and offer.revised_fee_usdc is not None:
            assert offer.revised_fee_usdc >= 80.0  # fee should not decrease on risky contract

    def test_counteroffer_longer_window_option(self, negotiation):
        offer = negotiation.generate_offer(
            _terms("eval-counter-04", roas=2.5, days=7),
            _underwriting(0.48, "counteroffer"),
        )
        assert offer.offer_type == "counteroffer"

    def test_counteroffer_new_campaign_type(self, negotiation):
        offer = negotiation.generate_offer(
            _terms("eval-counter-05", roas=2.2, ctype="new"),
            _underwriting(0.55, "counteroffer"),
        )
        assert offer.offer_type in ("accept", "counteroffer")

    def test_counteroffer_message_not_empty(self, negotiation):
        offer = negotiation.generate_offer(
            _terms("eval-counter-06", roas=3.0),
            _underwriting(0.42, "counteroffer"),
        )
        assert offer.message
        assert len(offer.message) >= 20


class TestRejectScenarios:
    def test_clear_reject_very_low_probability(self, negotiation):
        offer = negotiation.generate_offer(
            _terms("eval-reject-01", roas=5.0),
            _underwriting(0.15, "reject"),
        )
        assert offer.offer_type == "reject"
        assert offer.revised_threshold is None
        assert offer.revised_fee_usdc is None

    def test_reject_explains_reasoning(self, negotiation):
        offer = negotiation.generate_offer(
            _terms("eval-reject-02", roas=6.0),
            _underwriting(0.08, "reject"),
        )
        assert offer.offer_type == "reject"
        assert len(offer.message) > 20

    def test_reject_very_aggressive_roas(self, negotiation):
        offer = negotiation.generate_offer(
            _terms("eval-reject-03", roas=8.0, days=3),
            _underwriting(0.05, "reject"),
        )
        assert offer.offer_type == "reject"


class TestOutputSchemaCompliance:
    """Every offer must pass Pydantic validation — these test the validator not the LLM."""

    @pytest.mark.parametrize("prob,rec", [
        (0.75, "accept"),
        (0.55, "counteroffer"),
        (0.20, "reject"),
    ])
    def test_offer_schema_valid(self, negotiation, prob, rec):
        offer = negotiation.generate_offer(
            _terms(f"eval-schema-{rec}", roas=2.5),
            _underwriting(prob, rec),
        )
        # Pydantic model_validate_json would have raised if schema was invalid
        assert offer.offer_type in ("accept", "counteroffer", "reject")
        assert isinstance(offer.message, str)

    def test_accept_has_no_revised_fields(self, negotiation):
        offer = negotiation.generate_offer(
            _terms("eval-schema-accept", roas=2.0),
            _underwriting(0.78, "accept"),
        )
        if offer.offer_type == "accept":
            assert offer.revised_threshold is None
            assert offer.revised_fee_usdc is None
            assert offer.revised_time_window_days is None
