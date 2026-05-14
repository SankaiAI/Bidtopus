"""Read-only SQLAlchemy models for backend-owned tables.

The agent reads from these tables but never writes to them.
All writes to performance_contracts and strategy_plans are owned by the backend.

Assumed schema (matches backend FastAPI state machine):
  performance_contracts — core contract record + status
  strategy_plans        — LLM-generated plan + merchant approval status

If the backend renames or alters columns, update the mapped_column names here.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class BackendBase(DeclarativeBase):
    pass


class PerformanceContractORM(BackendBase):
    """Read-only view of the backend's performance_contracts table."""
    __tablename__ = "performance_contracts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    merchant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    status: Mapped[str] = mapped_column(String(50), nullable=False)

    # Contract terms
    target_roas: Mapped[float] = mapped_column(Float, nullable=False)
    minimum_spend: Mapped[float] = mapped_column(Float, nullable=False)
    time_window_days: Mapped[int] = mapped_column(Integer, nullable=False)
    success_fee_usdc: Mapped[float] = mapped_column(Float, nullable=False)
    campaign_type: Mapped[str] = mapped_column(String(20), nullable=False)
    campaign_goal: Mapped[str] = mapped_column(Text, nullable=True)

    # Ad account context (stored on the contract for now)
    account_id: Mapped[str | None] = mapped_column(String(50), nullable=True)
    pixel_id: Mapped[str | None] = mapped_column(String(50), nullable=True)
    avg_daily_spend: Mapped[float | None] = mapped_column(Float, nullable=True)
    historical_roas_7d: Mapped[float | None] = mapped_column(Float, nullable=True)
    historical_roas_30d: Mapped[float | None] = mapped_column(Float, nullable=True)
    aov: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Lifecycle timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    window_start: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    window_end: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    # Negotiation turn tracking
    negotiation_turn_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class StrategyPlanORM(BackendBase):
    """Read-only view of the backend's strategy_plans table."""
    __tablename__ = "strategy_plans"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    contract_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    approval_status: Mapped[str] = mapped_column(String(20), nullable=False)  # pending | approved | rejected
    planned_actions: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
