"""All Pydantic models for agent inputs and outputs.

Rules:
- This file has zero imports from any other agent module (Types layer).
- All field constraints (ge/le/max_length/pattern) are declared here, not in services.
- AccountContext uses extra="forbid" to block prompt injection via unknown keys.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


# ── Contract / Merchant inputs ────────────────────────────────────────────────

class ContractTerms(BaseModel):
    contract_id: str
    requested_target_roas: float = Field(ge=0.1, le=20.0)
    minimum_spend: float = Field(ge=0.0)
    time_window_days: int = Field(ge=1, le=90)
    success_fee_usdc: float = Field(ge=1.0, le=100_000.0)
    campaign_type: Literal["new", "optimize"]
    campaign_goal: str = Field(max_length=500)


class AccountContext(BaseModel):
    """Merchant-controlled fields. extra='forbid' rejects unknown keys at the API boundary."""
    model_config = ConfigDict(extra="forbid")

    account_id: str = Field(pattern=r"^act_\d+$")
    pixel_id: str | None = Field(None, pattern=r"^\d+$")
    ad_account: str | None = None
    aov: float | None = Field(None, ge=0.0)
    historical_roas_7d: float | None = Field(None, ge=0.0)
    historical_roas_30d: float | None = Field(None, ge=0.0)
    avg_daily_spend: float | None = Field(None, ge=0.0)


class UnderwritingInput(BaseModel):
    contract_terms: ContractTerms
    account_context: AccountContext


# ── ML outputs ────────────────────────────────────────────────────────────────

class UnderwritingResult(BaseModel):
    success_probability: float = Field(ge=0.0, le=1.0)
    risk_level: Literal["low", "medium", "high"]
    expected_roas_range: tuple[float, float]
    recommendation: Literal["accept", "counteroffer", "reject"]
    recommended_fee_usdc: float = Field(ge=1.0, le=100_000.0)


class ForecastInput(BaseModel):
    current_spend: float = Field(ge=0.0)
    current_revenue: float = Field(ge=0.0)
    current_roas: float = Field(ge=0.0)
    days_elapsed: int = Field(ge=0)
    days_remaining: int = Field(ge=0)
    target_roas: float = Field(ge=0.1)
    minimum_spend: float = Field(ge=0.0)


class ForecastResult(BaseModel):
    predicted_final_roas: float
    predicted_final_spend: float
    success_probability: float = Field(ge=0.0, le=1.0)
    status: Literal["on_track", "at_risk", "off_track"]


# ── LLM outputs ───────────────────────────────────────────────────────────────

class AgentOffer(BaseModel):
    """LLM negotiation output. All revised_* fields null on accept/reject."""
    offer_type: Literal["accept", "counteroffer", "reject"]
    message: str = Field(max_length=1000)
    revised_threshold: float | None = Field(None, ge=0.1, le=10.0)
    revised_fee_usdc: float | None = Field(None, ge=1.0, le=100_000.0)
    revised_time_window_days: int | None = Field(None, ge=1, le=90)


class StrategyAction(BaseModel):
    type: Literal[
        "create_campaign",
        "create_ad_set",
        "set_budget",
        "update_targeting",
        "pause_ad_set",
    ]
    params: dict[str, Any]


class StrategyPlan(BaseModel):
    """LLM strategy output — shown to merchant for approval before any action executes."""
    strategy_summary: str = Field(max_length=2000)
    actions: list[StrategyAction]
    estimated_daily_spend: float | None = Field(None, ge=0.0)
    expected_roas: float | None = Field(None, ge=0.0)


# ── Resolution ────────────────────────────────────────────────────────────────

class ResolutionInput(BaseModel):
    contract_id: str
    final_spend: float = Field(ge=0.0)
    final_revenue: float = Field(ge=0.0)
    final_roas: float = Field(ge=0.0)
    target_roas: float = Field(ge=0.0)
    minimum_spend: float = Field(ge=0.0)
    evaluation_window_complete: bool


class ResolutionResult(BaseModel):
    outcome: Literal["success", "failure"]
    final_spend: float
    final_revenue: float
    final_roas: float
    threshold: float
    minimum_spend: float
    minimum_spend_met: bool
    target_met: bool
    evaluation_window_complete: bool


# ── Performance / Ads ─────────────────────────────────────────────────────────

class PerformanceSnapshot(BaseModel):
    spend: float = Field(ge=0.0)
    revenue: float = Field(ge=0.0)
    roas: float = Field(ge=0.0)
    impressions: int = Field(ge=0, default=0)
    clicks: int = Field(ge=0, default=0)
    day: int = Field(ge=0)
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class OptimizationAction(BaseModel):
    action_type: Literal[
        "increase_budget",
        "decrease_budget",
        "pause_ad_set",
        "update_targeting",
    ]
    reason: str
    params: dict[str, Any]
    requires_approval: bool = False


# ── Escrow / Wallets ──────────────────────────────────────────────────────────

class EscrowStatus(BaseModel):
    status: Literal["funded", "released", "refunded", "unfunded"]
    amount_usdc: float
    contract_address: str


class SettlementResult(BaseModel):
    action: Literal["release", "refund"]
    tx_hash: str
    amount_usdc: float
    recipient_address: str


class WalletInfo(BaseModel):
    wallet_id: str
    address: str
    blockchain: str = "ETH-SEPOLIA"


class WalletBalance(BaseModel):
    wallet_id: str
    balance_usdc: float
    address: str
