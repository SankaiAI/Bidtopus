"""Shared test fixtures."""
import pytest

from agent.models.types import AccountContext, ContractTerms


@pytest.fixture
def contract_terms():
    return ContractTerms(
        contract_id="test-contract-001",
        requested_target_roas=2.0,
        minimum_spend=500.0,
        time_window_days=7,
        success_fee_usdc=100.0,
        campaign_type="optimize",
        campaign_goal="Drive sales for summer collection",
    )


@pytest.fixture
def account_context():
    return AccountContext(
        account_id="act_123456789",
        pixel_id="987654321",
        historical_roas_7d=2.1,
        historical_roas_30d=1.9,
        avg_daily_spend=100.0,
        aov=75.0,
    )
