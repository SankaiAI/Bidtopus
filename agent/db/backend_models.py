"""Read-only SQLAlchemy models for backend-owned tables.

The agent reads from these tables but never writes to them.
All writes to performance_contracts and strategy_plans are owned by the backend.

Schema verified against backend/db/models.py (tickets #34, #76):
  performance_contracts — core contract record + status + meta_ads_account FK
  meta_ads_accounts     — per-merchant Meta ad accounts (act_XXXXX strings)
  strategy_plans        — LLM-generated plan + merchant approval status
"""
from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSON
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class BackendBase(DeclarativeBase):
    pass


class MetaAdsAccountORM(BackendBase):
    """Read-only view of the backend's meta_ads_accounts table (ticket #76).

    `meta_ads_account_id` is the Meta-side "act_XXXXX" string used by the Ads SDK;
    `id` is the internal UUID used as FK from performance_contracts.
    """
    __tablename__ = "meta_ads_accounts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    merchant_id: Mapped[str] = mapped_column(String(36), nullable=False)
    meta_ads_account_id: Mapped[str] = mapped_column(String, nullable=False)
    name: Mapped[str | None] = mapped_column(String, nullable=True)


class PerformanceContractORM(BackendBase):
    """Read-only view of the backend's performance_contracts table.

    id and merchant_id are stored as VARCHAR(36) by the backend (String, not UUID type).
    Using String here avoids a varchar=uuid operator error in PostgreSQL when filtering.
    """
    __tablename__ = "performance_contracts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    merchant_id: Mapped[str] = mapped_column(String(36), nullable=False)
    meta_ads_account_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("meta_ads_accounts.id"), nullable=True
    )
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

    meta_account: Mapped["MetaAdsAccountORM | None"] = relationship(
        "MetaAdsAccountORM", lazy="joined"
    )

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
        # Prefer the FK relationship added in backend #76 — it points to the
        # authoritative meta_ads_accounts row whose `meta_ads_account_id` column
        # holds the Meta-side "act_XXXXX" string.
        if self.meta_account and self.meta_account.meta_ads_account_id:
            return self.meta_account.meta_ads_account_id
        ctx = self.account_context or {}
        json_account = ctx.get("meta_ads_account_id")
        if json_account:
            return json_account
        # Negotiation-phase contracts have no linked Meta account yet.
        # "act_0" satisfies the AccountContext validator and is safe here because
        # the ML underwriting model does not use account_id as a feature.
        # generate-strategy and execute-ads only run post-funding when a real
        # account is guaranteed to be linked.
        return "act_0"

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

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    contract_id: Mapped[str] = mapped_column(String(36), nullable=False)
    approval_status: Mapped[str] = mapped_column(String(20), nullable=False)  # pending | approved | rejected
    planned_actions: Mapped[list | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
