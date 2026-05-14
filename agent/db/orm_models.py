"""SQLAlchemy ORM models for agent-owned tables.

Agent owns: audit_events, contract_messages
Backend owns: performance_contracts, strategy_plans, agent_offers

Migration note: run Alembic from the backend to include these models.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Index, String, Text
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class AgentBase(DeclarativeBase):
    pass


class AuditEventORM(AgentBase):
    """Internal observability store — every component call logged here."""
    __tablename__ = "audit_events"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    contract_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    component: Mapped[str] = mapped_column(String(50), nullable=False)
    event_type: Mapped[str] = mapped_column(String(50), nullable=False)
    payload: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )

    __table_args__ = (
        Index("idx_audit_contract_id", "contract_id"),
        Index("idx_audit_component", "contract_id", "component"),
        Index("idx_audit_event_type", "contract_id", "event_type"),
        Index("idx_audit_created_at", "contract_id", "created_at"),
    )


class ContractMessageORM(AgentBase):
    """Merchant-facing UI timeline — only what the merchant should see."""
    __tablename__ = "contract_messages"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    contract_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False)   # "agent" | "merchant"
    type: Mapped[str] = mapped_column(String(50), nullable=False)   # "message" | "daily_update" | "approval_request" | "system_event"
    content: Mapped[str] = mapped_column(Text, nullable=False)
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSON, nullable=True)
    status: Mapped[str | None] = mapped_column(String(20), nullable=True)  # for approval_request: "pending" | "approved" | "rejected"
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )

    __table_args__ = (
        Index("idx_messages_contract_id", "contract_id"),
        Index("idx_messages_created_at", "contract_id", "created_at"),
    )
