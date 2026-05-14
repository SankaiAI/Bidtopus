"""Tests for the ML underwriting model."""
import pytest

from agent.ml.underwriting import UnderwritingModel
from agent.models.types import AccountContext, ContractTerms


@pytest.fixture(scope="module")
def model():
    return UnderwritingModel()


@pytest.fixture
def strong_account():
    return AccountContext(
        account_id="act_111111111",
        historical_roas_7d=2.5,
        historical_roas_30d=2.4,
        avg_daily_spend=200.0,
        aov=100.0,
    )


@pytest.fixture
def weak_account():
    return AccountContext(
        account_id="act_222222222",
        historical_roas_7d=1.1,
        historical_roas_30d=1.0,
        avg_daily_spend=50.0,
        aov=30.0,
    )


class TestOutputSchema:
    def test_returns_all_required_fields(self, model, strong_account):
        terms = ContractTerms(
            contract_id="test-001",
            requested_target_roas=2.0,
            minimum_spend=500.0,
            time_window_days=7,
            success_fee_usdc=100.0,
            campaign_type="optimize",
            campaign_goal="Test",
        )
        result = model.predict(terms, strong_account)
        assert 0.0 <= result.success_probability <= 1.0
        assert result.risk_level in ("low", "medium", "high")
        assert result.recommendation in ("accept", "counteroffer", "reject")
        assert len(result.expected_roas_range) == 2
        assert result.expected_roas_range[0] <= result.expected_roas_range[1]
        assert result.recommended_fee_usdc >= 1.0


class TestDecisionPolicy:
    def test_easy_contract_recommends_accept(self, model, strong_account):
        """ROAS target well below historical baseline → should lean accept."""
        terms = ContractTerms(
            contract_id="test-easy",
            requested_target_roas=1.5,   # well below 2.4 baseline
            minimum_spend=300.0,
            time_window_days=14,
            success_fee_usdc=80.0,
            campaign_type="optimize",
            campaign_goal="Test",
        )
        result = model.predict(terms, strong_account)
        assert result.recommendation in ("accept", "counteroffer")

    def test_very_aggressive_contract_recommends_reject(self, model, weak_account):
        """ROAS 4x target on a 1.0 baseline account → should lean reject."""
        terms = ContractTerms(
            contract_id="test-hard",
            requested_target_roas=4.0,   # 4x the 1.0 baseline
            minimum_spend=500.0,
            time_window_days=7,
            success_fee_usdc=50.0,
            campaign_type="new",
            campaign_goal="Test",
        )
        result = model.predict(terms, weak_account)
        assert result.recommendation in ("counteroffer", "reject")


class TestFeeLogic:
    def test_fee_increases_for_riskier_contract(self, model, weak_account):
        base_terms = dict(
            minimum_spend=300.0,
            time_window_days=7,
            success_fee_usdc=100.0,
            campaign_type="optimize",
            campaign_goal="Test",
        )
        easy = ContractTerms(contract_id="easy", requested_target_roas=1.2, **base_terms)
        hard = ContractTerms(contract_id="hard", requested_target_roas=3.5, **base_terms)

        result_easy = model.predict(easy, weak_account)
        result_hard = model.predict(hard, weak_account)

        # Harder contract should have higher recommended fee
        assert result_hard.recommended_fee_usdc >= result_easy.recommended_fee_usdc


class TestRobustness:
    def test_missing_historical_data_uses_defaults(self, model):
        """Account with no historical data should not raise."""
        account = AccountContext(account_id="act_999999999")
        terms = ContractTerms(
            contract_id="test-no-history",
            requested_target_roas=2.0,
            minimum_spend=300.0,
            time_window_days=7,
            success_fee_usdc=100.0,
            campaign_type="new",
            campaign_goal="Test",
        )
        result = model.predict(terms, account)
        assert 0.0 <= result.success_probability <= 1.0
