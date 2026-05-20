"""HTTP client for agent → backend calls.

This is the *only* direction-of-traffic this module supports. The backend
remains the source of truth for contract state — we never write to its DB,
only POST observability snapshots through its REST surface.

Authentication: every request carries an `X-Service-Token` header whose
value is `settings.AGENT_SERVICE_TOKEN`. The backend's verify_service_token
dependency rejects anything else.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

import httpx

from config import settings
from utils.logging import get_logger

logger = get_logger(__name__)

_TIMEOUT = httpx.Timeout(connect=5.0, read=10.0, write=10.0, pool=5.0)


def push_performance(
    contract_id: str,
    *,
    spend: float,
    revenue: float,
    roas: float | None,
    success_probability: float | None,
    timestamp: datetime | None = None,
) -> dict[str, Any] | None:
    """POST a performance snapshot to backend's ingest endpoint.

    Returns the backend's response payload on 201, or None when the backend
    returns 202 (the contract is no longer Active and the snapshot was dropped
    gracefully). Raises httpx.HTTPError on any other failure — callers must
    decide whether to swallow it.
    """
    url = f"{settings.BACKEND_BASE_URL.rstrip('/')}/api/contracts/{contract_id}/performance"
    headers = {"X-Service-Token": settings.AGENT_SERVICE_TOKEN}
    body: dict[str, Any] = {
        "spend": spend,
        "revenue": revenue,
        "roas": roas,
        "success_probability": success_probability,
        "timestamp": timestamp.isoformat() if timestamp else None,
    }

    resp = httpx.post(url, json=body, headers=headers, timeout=_TIMEOUT)
    if resp.status_code == 202:
        logger.info(
            "backend_push_skipped_inactive",
            contract_id=contract_id,
            status_code=202,
        )
        return None
    resp.raise_for_status()
    logger.info(
        "backend_push_complete",
        contract_id=contract_id,
        status_code=resp.status_code,
        spend=spend,
        revenue=revenue,
        roas=roas,
    )
    return resp.json()
