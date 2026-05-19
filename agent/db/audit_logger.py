"""Queryable audit logger — the agent's internal memory.

Every component call writes here BEFORE executing (intent) and AFTER (result).
This is the backbone for crash recovery, chat Q&A context, and debugging.

The logger is NOT write-only. Every query method here must work from day 1.
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from sqlalchemy.orm import Session

from db.orm_models import AuditEventORM

SENSITIVE_KEYS = {"account_id", "pixel_id", "access_token", "wallet_address", "private_key"}


def _redact(payload: dict) -> dict:
    """Truncate sensitive field values before writing to DB."""
    return {
        k: (v[:8] + "***" if k in SENSITIVE_KEYS and isinstance(v, str) else v)
        for k, v in payload.items()
    }


class AuditLogger:
    """Wraps a SQLAlchemy Session. Pass db from FastAPI DI or background scheduler."""

    def __init__(self, db: Session) -> None:
        self._db = db

    # ── Write ─────────────────────────────────────────────────────────────────

    def log(
        self,
        contract_id: str,
        component: str,
        event_type: str,
        payload: dict[str, Any],
    ) -> None:
        """Write one audit event and commit immediately.

        Commit (not just flush) so that the row is visible to subsequent HTTP
        requests that arrive before FastAPI's generator teardown runs db.commit().
        FastAPI sends the response before running post-yield dependency cleanup,
        so a flush-only write is invisible to the next agent call.
        """
        event = AuditEventORM(
            contract_id=contract_id,
            component=component,
            event_type=event_type,
            payload=_redact(payload),
        )
        self._db.add(event)
        self._db.commit()

    # ── Read — all query patterns the agent uses ──────────────────────────────

    def get_all(self, contract_id: str) -> list[AuditEventORM]:
        return (
            self._db.query(AuditEventORM)
            .filter(AuditEventORM.contract_id == contract_id)
            .order_by(AuditEventORM.created_at)
            .all()
        )

    def get_latest_intent(self, contract_id: str) -> AuditEventORM | None:
        """Used by crash recovery to find where the agent stopped."""
        return (
            self._db.query(AuditEventORM)
            .filter(
                AuditEventORM.contract_id == contract_id,
                AuditEventORM.event_type == "intent",
            )
            .order_by(AuditEventORM.created_at.desc())
            .first()
        )

    def get_latest_snapshot(self, contract_id: str) -> dict | None:
        """Most recent Meta Ads performance snapshot."""
        event = (
            self._db.query(AuditEventORM)
            .filter(
                AuditEventORM.contract_id == contract_id,
                AuditEventORM.component == "meta_ads",
                AuditEventORM.event_type == "snapshot",
            )
            .order_by(AuditEventORM.created_at.desc())
            .first()
        )
        return event.payload if event else None

    def get_by_component(self, contract_id: str, component: str) -> list[AuditEventORM]:
        return (
            self._db.query(AuditEventORM)
            .filter(
                AuditEventORM.contract_id == contract_id,
                AuditEventORM.component == component,
            )
            .order_by(AuditEventORM.created_at)
            .all()
        )

    def get_since(self, contract_id: str, days_ago: int) -> list[AuditEventORM]:
        """Last N days of events — used by chat Q&A for context."""
        cutoff = datetime.utcnow() - timedelta(days=days_ago)
        return (
            self._db.query(AuditEventORM)
            .filter(
                AuditEventORM.contract_id == contract_id,
                AuditEventORM.created_at >= cutoff,
            )
            .order_by(AuditEventORM.created_at.desc())
            .limit(50)
            .all()
        )

    def get_llm_decisions(self, contract_id: str) -> list[AuditEventORM]:
        return (
            self._db.query(AuditEventORM)
            .filter(
                AuditEventORM.contract_id == contract_id,
                AuditEventORM.component.in_(["llm_negotiation", "llm_strategy"]),
            )
            .order_by(AuditEventORM.created_at)
            .all()
        )
