"""Read-only SQLAlchemy models for backend-owned tables.

The agent reads from these tables but never writes to them.
All writes to performance_contracts and strategy_plans are owned by the backend.

Schema verified against backend/db/models.py (ticket #34):
  performance_contracts — core contract record + status
  strategy_plans        — LLM-generated plan + merchant approval status
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta

from sqlalchemy import DateTime, Float, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class BackendBase(DeclarativeBase):
    pass


class PerformanceContractORM(BackendBase):
    """Read-only view of the backend's performance_contracts table."""
    __tablename__ = "performance_contracts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    merchant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    status: Mapped[str] = mapped_column(String(50), nullable=False)
    target_metric: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # Contract terms — NOTE: ROAS target is stored as `threshold`, campaign type as `campaign_mode`
    threshold: Mapped[float | None] = mapped_column(Float, nullable=True)
    minimum_spend: Mapped[float | None] = mapped_column(Float, nullable=True)
    time_window_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    success_fee_usdc: Mapped[float | None] = mapped_column(Float, nullable=True)
    campaign_mode: Mapped[str | None] = mapped_column(String(20), nullable=True)
    campaign_goal: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Account context — single JSON blob, populated by GET /agent/account-context
    account_context: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    # Lifecycle timestamps — window_start/end are derived from funded_at, not stored
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    funded_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    # ── Python-level aliases so all existing route helpers work unchanged ──────

    @property
    def target_roas(self) -> float:
        return self.threshold or 0.0

    @property
    def campaign_type(self) -> str:
        return self.campaign_mode or "new"

    @property
    def window_start(self) -> datetime | None:
        return self.funded_at

    @property
    def window_end(self) -> datetime | None:
        if self.funded_at and self.time_window_days:
            return self.funded_at + timedelta(days=self.time_window_days)
        return None

    @property
    def account_id(self) -> str:
        ctx = self.account_context or {}
        return ctx.get("meta_ads_account_id") or "act_0000000000"

    @property
    def pixel_id(self) -> str | None:
        return None  # not in backend schema

    @property
    def avg_daily_spend(self) -> float | None:
        return (self.account_context or {}).get("avg_daily_spend")

    @property
    def historical_roas_7d(self) -> float | None:
        return (self.account_context or {}).get("historical_roas_7d")

    @property
    def historical_roas_30d(self) -> float | None:
        return (self.account_context or {}).get("historical_roas_30d")

    @property
    def aov(self) -> float | None:
        return (self.account_context or {}).get("aov")

    @property
    def negotiation_turn_count(self) -> int:
        return 0  # not in backend schema — backend manages turn counting


class StrategyPlanORM(BackendBase):
    """Read-only view of the backend's strategy_plans table."""
    __tablename__ = "strategy_plans"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    contract_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    approval_status: Mapped[str] = mapped_column(String(20), nullable=False)  # pending | approved | rejected
    planned_actions: Mapped[list | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
