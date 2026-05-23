import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Column, DateTime, Float, ForeignKey,
    Index, Integer, String, Text, UniqueConstraint, JSON,
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import relationship

from db.session import Base


def _uuid():
    return str(uuid.uuid4())


# Variant type: stored as `uuid` in Postgres (matches the existing users.id /
# performance_contracts.id columns on Neon), and as VARCHAR(36) in SQLite for
# tests. Values are kept as plain strings (as_uuid=False) so Python-side
# comparisons stay consistent across dialects — this is the same lesson the
# accept_offer / approve_execution coercions baked in (commit b6c0487).
UUID_FK = String(36).with_variant(PG_UUID(as_uuid=False), "postgresql")


def _now():
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=_uuid)
    clerk_user_id = Column(String, unique=True, nullable=False, index=True)
    email = Column(String, nullable=False)
    wallet_address = Column(String, nullable=True)
    approval_mode = Column(String, nullable=False, default="manual")  # "manual" | "auto"
    meta_ads_account_id = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=_now, nullable=False)

    contracts = relationship("PerformanceContract", back_populates="merchant")
    meta_accounts = relationship("MetaAdsAccount", back_populates="merchant")


class WalletConnectNonce(Base):
    """Single-use nonce for SIWE wallet-connect (issue #84)."""
    __tablename__ = "wallet_connect_nonces"

    id = Column(String(36), primary_key=True, default=_uuid)
    clerk_user_id = Column(String, nullable=False, index=True)
    nonce = Column(String, unique=True, nullable=False, index=True)
    issued_at = Column(DateTime(timezone=True), default=_now, nullable=False)
    used_at = Column(DateTime(timezone=True), nullable=True)


class MetaAdsAccount(Base):
    __tablename__ = "meta_ads_accounts"

    id = Column(UUID_FK, primary_key=True, default=_uuid)
    merchant_id = Column(UUID_FK, ForeignKey("users.id"), nullable=False, index=True)
    meta_ads_account_id = Column(String, nullable=False)   # the "act_XXXXX" string Meta uses
    name = Column(String, nullable=True)
    access_token = Column(String, nullable=True)           # per-merchant OAuth token; NULL for mock/legacy rows
    connected_at = Column(DateTime(timezone=True), default=_now, nullable=False)

    merchant = relationship("User", back_populates="meta_accounts")
    contracts = relationship("PerformanceContract", back_populates="meta_account")

    __table_args__ = (
        UniqueConstraint("merchant_id", "meta_ads_account_id", name="uq_merchant_meta_account"),
    )


class PerformanceContract(Base):
    __tablename__ = "performance_contracts"

    id = Column(String(36), primary_key=True, default=_uuid)
    merchant_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    meta_ads_account_id = Column(UUID_FK, ForeignKey("meta_ads_accounts.id"), nullable=True, index=True)
    title = Column(String, nullable=True)
    target_metric = Column(String, nullable=False, default="ROAS")
    threshold = Column(Float, nullable=True)
    minimum_spend = Column(Float, nullable=True)
    time_window_days = Column(Integer, nullable=True)
    success_fee_usdc = Column(Float, nullable=True)
    campaign_mode = Column(String, nullable=True)
    campaign_goal = Column(Text, nullable=True)
    account_context = Column(JSON, nullable=True)
    status = Column(String, nullable=False, default="Created")
    created_at = Column(DateTime(timezone=True), default=_now, nullable=False)
    funded_at = Column(DateTime(timezone=True), nullable=True)
    resolved_at = Column(DateTime(timezone=True), nullable=True)

    merchant = relationship("User", back_populates="contracts")
    meta_account = relationship("MetaAdsAccount", back_populates="contracts")
    underwriting_results = relationship("UnderwritingResult", back_populates="contract")
    agent_offers = relationship("AgentOffer", back_populates="contract")
    escrow_records = relationship("EscrowRecord", back_populates="contract")
    strategy_plans = relationship("StrategyPlan", back_populates="contract")
    performance_snapshots = relationship("PerformanceSnapshot", back_populates="contract")
    resolution_records = relationship("ResolutionRecord", back_populates="contract")
    messages = relationship("ContractMessage", back_populates="contract")
    audit_events = relationship("AuditEvent", back_populates="contract")


class UnderwritingResult(Base):
    __tablename__ = "underwriting_results"

    id = Column(String(36), primary_key=True, default=_uuid)
    contract_id = Column(String(36), ForeignKey("performance_contracts.id"), nullable=False, index=True)
    success_probability = Column(Float, nullable=False)
    risk_level = Column(String, nullable=False)
    expected_roas_range = Column(JSON, nullable=False)
    recommendation = Column(String, nullable=False)
    recommended_fee_usdc = Column(Float, nullable=False)
    created_at = Column(DateTime(timezone=True), default=_now, nullable=False)

    contract = relationship("PerformanceContract", back_populates="underwriting_results")


class AgentOffer(Base):
    __tablename__ = "agent_offers"

    id = Column(String(36), primary_key=True, default=_uuid)
    contract_id = Column(String(36), ForeignKey("performance_contracts.id"), nullable=False, index=True)
    offer_type = Column(String, nullable=False)
    message = Column(Text, nullable=False)
    revised_threshold = Column(Float, nullable=True)
    revised_fee_usdc = Column(Float, nullable=True)
    revised_time_window_days = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), default=_now, nullable=False)

    contract = relationship("PerformanceContract", back_populates="agent_offers")


class EscrowRecord(Base):
    __tablename__ = "escrow_records"

    id = Column(String(36), primary_key=True, default=_uuid)
    contract_id = Column(String(36), ForeignKey("performance_contracts.id"), nullable=False, index=True)
    chain_contract_id = Column(String, nullable=True)
    tx_hash = Column(String, nullable=True)
    amount_usdc = Column(Float, nullable=False)
    status = Column(String, nullable=False, default="pending")
    settlement_tx_hash = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=_now, nullable=False)

    contract = relationship("PerformanceContract", back_populates="escrow_records")


class StrategyPlan(Base):
    __tablename__ = "strategy_plans"

    id = Column(String(36), primary_key=True, default=_uuid)
    contract_id = Column(String(36), ForeignKey("performance_contracts.id"), nullable=False, index=True)
    summary = Column(Text, nullable=False)
    planned_actions = Column(JSON, nullable=False)
    approval_status = Column(String, nullable=False, default="pending")
    approved_at = Column(DateTime(timezone=True), nullable=True)
    execution_receipts = Column(JSON, nullable=True)  # {campaign_id, ad_set_ids, creative_ids} written after Day 1 execution
    created_at = Column(DateTime(timezone=True), default=_now, nullable=False)

    contract = relationship("PerformanceContract", back_populates="strategy_plans")


class PerformanceSnapshot(Base):
    __tablename__ = "performance_snapshots"

    id = Column(String(36), primary_key=True, default=_uuid)
    contract_id = Column(String(36), ForeignKey("performance_contracts.id"), nullable=False, index=True)
    timestamp = Column(DateTime(timezone=True), default=_now, nullable=False)
    spend = Column(Float, nullable=False, default=0.0)
    revenue = Column(Float, nullable=False, default=0.0)
    roas = Column(Float, nullable=True)
    success_probability = Column(Float, nullable=True)

    contract = relationship("PerformanceContract", back_populates="performance_snapshots")


class ResolutionRecord(Base):
    __tablename__ = "resolution_records"

    id = Column(String(36), primary_key=True, default=_uuid)
    contract_id = Column(String(36), ForeignKey("performance_contracts.id"), nullable=False, index=True, unique=True)
    final_spend = Column(Float, nullable=False)
    final_revenue = Column(Float, nullable=False)
    final_roas = Column(Float, nullable=False)
    outcome = Column(String, nullable=False)
    settlement_tx_hash = Column(String, nullable=True)
    resolved_at = Column(DateTime(timezone=True), default=_now, nullable=False)

    contract = relationship("PerformanceContract", back_populates="resolution_records")


class ContractMessage(Base):
    __tablename__ = "contract_messages"

    id = Column(String(36), primary_key=True, default=_uuid)
    contract_id = Column(String(36), ForeignKey("performance_contracts.id"), nullable=False)
    role = Column(String, nullable=False)
    type = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    extra = Column("metadata", JSON, nullable=True)
    status = Column(String, nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=_now, nullable=False)

    contract = relationship("PerformanceContract", back_populates="messages")

    __table_args__ = (
        Index("ix_contract_messages_contract_id", "contract_id"),
        Index("ix_contract_messages_created_at", "created_at"),
    )


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id = Column(String(36), primary_key=True, default=_uuid)
    contract_id = Column(String(36), ForeignKey("performance_contracts.id"), nullable=False)
    component = Column(String(50), nullable=False)
    event_type = Column(String(50), nullable=False)
    payload = Column(JSON, nullable=False)
    created_at = Column(DateTime(timezone=True), default=_now, nullable=False)

    contract = relationship("PerformanceContract", back_populates="audit_events")

    __table_args__ = (
        Index("ix_audit_events_contract_id", "contract_id"),
        Index("ix_audit_events_component", "component"),
        Index("ix_audit_events_created_at", "created_at"),
    )
