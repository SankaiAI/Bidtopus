from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel


# ── Users ─────────────────────────────────────────────────────────────────────

class WalletConnectRequest(BaseModel):
    wallet_address: str
    signature: str


class UserResponse(BaseModel):
    id: str
    clerk_user_id: str
    email: str
    wallet_address: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Contract Create ───────────────────────────────────────────────────────────

class ContractCreateRequest(BaseModel):
    target_roas: float
    min_spend_usd: float
    time_window_days: int
    success_fee_usdc: float
    campaign_mode: str
    campaign_goal: Optional[str] = None
    account_context: Optional[dict] = None


class ContractResponse(BaseModel):
    id: str
    merchant_id: str
    status: str
    target_roas: float
    min_spend_usd: float
    time_window_days: int
    success_fee_usdc: float
    campaign_mode: str
    campaign_goal: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_contract(cls, c) -> "ContractResponse":
        return cls(
            id=c.id,
            merchant_id=c.merchant_id,
            status=c.status,
            target_roas=c.threshold,
            min_spend_usd=c.minimum_spend,
            time_window_days=c.time_window_days,
            success_fee_usdc=c.success_fee_usdc,
            campaign_mode=c.campaign_mode,
            campaign_goal=c.campaign_goal,
            created_at=c.created_at,
        )


# ── Underwriting ──────────────────────────────────────────────────────────────

class UnderwritingResponse(BaseModel):
    id: str
    contract_id: str
    success_probability: float
    risk_level: str
    expected_roas_range: list[float]
    recommendation: str
    recommended_fee_usdc: float
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Agent Offer ───────────────────────────────────────────────────────────────

class AgentOfferResponse(BaseModel):
    id: str
    contract_id: str
    offer_type: str
    message: str
    revised_threshold: Optional[float] = None
    revised_fee_usdc: Optional[float] = None
    revised_time_window_days: Optional[int] = None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Accept Offer ──────────────────────────────────────────────────────────────

class AcceptOfferRequest(BaseModel):
    offer_id: str


# ── Fund Escrow ───────────────────────────────────────────────────────────────

class FundEscrowRequest(BaseModel):
    tx_hash: str
    chain_contract_id: str
    amount_usdc: float


class EscrowResponse(BaseModel):
    id: str
    contract_id: str
    chain_contract_id: Optional[str]
    tx_hash: Optional[str]
    amount_usdc: float
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Strategy Plan ─────────────────────────────────────────────────────────────

class StrategyPlanResponse(BaseModel):
    id: str
    contract_id: str
    summary: str
    planned_actions: Any
    approval_status: str
    approved_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ── Approve Execution ─────────────────────────────────────────────────────────

class ApproveExecutionRequest(BaseModel):
    plan_id: str
    approved: bool = True


# ── Performance ───────────────────────────────────────────────────────────────

class PerformanceResponse(BaseModel):
    id: str
    contract_id: str
    timestamp: datetime
    spend: float
    revenue: float
    roas: Optional[float]
    success_probability: Optional[float]

    model_config = {"from_attributes": True}


# ── Resolution ────────────────────────────────────────────────────────────────

class ResolutionResponse(BaseModel):
    id: str
    contract_id: str
    final_spend: float
    final_revenue: float
    final_roas: float
    outcome: str
    settlement_tx_hash: Optional[str]
    resolved_at: datetime

    model_config = {"from_attributes": True}


# ── Messages ──────────────────────────────────────────────────────────────────

class MessageCreateRequest(BaseModel):
    message: str


class MessageResponse(BaseModel):
    id: str
    contract_id: str
    role: str
    type: str
    content: str
    extra: Optional[Any] = None
    status: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Chat ──────────────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    message: str


# ── Negotiation ───────────────────────────────────────────────────────────────

class NegotiationHistoryItem(BaseModel):
    role: str  # "user" or "assistant"
    content: str


class NegotiationRequest(BaseModel):
    message: str
    history: list[NegotiationHistoryItem] = []
