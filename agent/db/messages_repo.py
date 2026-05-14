"""Merchant-facing message store — the UI timeline.

Only write here when the merchant should see something new.
The audit_logger gets everything; this gets only what surfaces in the frontend.

Message types:
  system_event      — contract created, escrow confirmed, campaign launched, settled
  message           — LLM negotiation offer (accept / counteroffer / reject)
  approval_request  — strategy plan or budget shift awaiting merchant approval
  daily_update      — monitoring tick with ROAS + forecast
"""
from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.orm import Session

from db.orm_models import ContractMessageORM


class MessagesRepo:
    def __init__(self, db: Session) -> None:
        self._db = db

    # ── Write ─────────────────────────────────────────────────────────────────

    def append(
        self,
        contract_id: str,
        role: str,
        type: str,
        content: str,
        metadata: dict[str, Any] | None = None,
        status: str | None = None,
    ) -> ContractMessageORM:
        msg = ContractMessageORM(
            contract_id=uuid.UUID(contract_id),
            role=role,
            type=type,
            content=content,
            metadata_=metadata,
            status=status,
        )
        self._db.add(msg)
        self._db.flush()
        return msg

    def update_status(self, message_id: str, status: str) -> None:
        """Update approval_request status: pending → approved | rejected."""
        self._db.query(ContractMessageORM).filter(
            ContractMessageORM.id == uuid.UUID(message_id)
        ).update({"status": status})
        self._db.flush()

    # ── Read ──────────────────────────────────────────────────────────────────

    def get_all(self, contract_id: str) -> list[ContractMessageORM]:
        return (
            self._db.query(ContractMessageORM)
            .filter(ContractMessageORM.contract_id == uuid.UUID(contract_id))
            .order_by(ContractMessageORM.created_at)
            .all()
        )

    def get_pending_approvals(self, contract_id: str) -> list[ContractMessageORM]:
        return (
            self._db.query(ContractMessageORM)
            .filter(
                ContractMessageORM.contract_id == uuid.UUID(contract_id),
                ContractMessageORM.type == "approval_request",
                ContractMessageORM.status == "pending",
            )
            .order_by(ContractMessageORM.created_at.desc())
            .all()
        )

    def get_latest_daily_update(self, contract_id: str) -> ContractMessageORM | None:
        return (
            self._db.query(ContractMessageORM)
            .filter(
                ContractMessageORM.contract_id == uuid.UUID(contract_id),
                ContractMessageORM.type == "daily_update",
            )
            .order_by(ContractMessageORM.created_at.desc())
            .first()
        )
