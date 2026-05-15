"""APScheduler background scheduler — 24h monitoring for Active contracts.

Usage:
    from scheduler import get_scheduler, register_monitoring_job

    # In main.py lifespan:
    get_scheduler().start()
    register_monitoring_job(contract_id)   # once per Active contract
    ...
    get_scheduler().shutdown(wait=False)

    # When a contract transitions to Active mid-run (POST /agent/activate):
    register_monitoring_job(contract_id)
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from apscheduler.schedulers.background import BackgroundScheduler

from utils.logging import get_logger

logger = get_logger(__name__)

_scheduler = BackgroundScheduler(timezone="UTC")


def get_scheduler() -> BackgroundScheduler:
    return _scheduler


def register_monitoring_job(contract_id: str) -> None:
    """Schedule a 24h monitoring tick for contract_id. Safe to call multiple times."""
    job_id = f"monitor_{contract_id}"
    if _scheduler.get_job(job_id):
        logger.info("monitoring_job_already_registered", contract_id=contract_id)
        return
    _scheduler.add_job(
        _run_monitoring_tick_job,
        trigger="interval",
        hours=24,
        args=[contract_id],
        id=job_id,
        replace_existing=True,
        misfire_grace_time=3600,  # allow up to 1h late on server restart
    )
    logger.info("monitoring_job_registered", contract_id=contract_id)


def _run_monitoring_tick_job(contract_id: str) -> None:
    """APScheduler job body — runs every 24h for an Active contract.

    Self-removes when the contract leaves Active state.
    Calls orchestrator.run_monitoring_tick(), which triggers resolution
    automatically when evaluation_window_complete is True.
    """
    import orchestrator
    from db.backend_models import PerformanceContractORM
    from db.base import get_db

    with get_db() as db:
        contract = (
            db.query(PerformanceContractORM)
            .filter(PerformanceContractORM.id == uuid.UUID(contract_id))
            .first()
        )
        if not contract:
            logger.error("monitoring_job_contract_not_found", contract_id=contract_id)
            _scheduler.remove_job(f"monitor_{contract_id}")
            return

        if contract.status != "Active":
            logger.info(
                "monitoring_job_contract_no_longer_active",
                contract_id=contract_id,
                status=contract.status,
            )
            _scheduler.remove_job(f"monitor_{contract_id}")
            return

        now = datetime.now(timezone.utc)
        window_start = (
            contract.window_start.replace(tzinfo=timezone.utc)
            if contract.window_start
            else now
        )
        window_end = (
            contract.window_end.replace(tzinfo=timezone.utc)
            if contract.window_end
            else now
        )
        days_elapsed = max(1, (now - window_start).days + 1)
        days_remaining = max(0, (window_end - now).days)
        evaluation_window_complete = now >= window_end

        logger.info(
            "monitoring_tick_firing",
            contract_id=contract_id,
            day=days_elapsed,
            days_remaining=days_remaining,
            evaluation_window_complete=evaluation_window_complete,
        )

        orchestrator.run_monitoring_tick(
            contract_id=contract_id,
            day=days_elapsed,
            target_roas=contract.target_roas,
            minimum_spend=contract.minimum_spend,
            days_elapsed=days_elapsed,
            days_remaining=days_remaining,
            evaluation_window_complete=evaluation_window_complete,
            db=db,
        )
