"""Service-to-service auth for the backend → agent channel.

The backend signs every call into /agent/* with an `X-Service-Token` header.
We verify it using `hmac.compare_digest` against `settings.AGENT_SERVICE_TOKEN`.
The env var name and value MUST match the backend's `AGENT_SERVICE_TOKEN`.

## Posture

`AGENT_SERVICE_TOKEN_FAIL_OPEN` (config.py) decides what happens when the
token env var itself is unset:

  - `False` (default, production) → 503 on every /agent/* request
  - `True` (local dev grace)      → request passes, startup logs a warning
"""
from __future__ import annotations

import hmac

from fastapi import Header, HTTPException

from config import settings
from utils.logging import get_logger

log = get_logger(__name__)


def verify_service_token(x_service_token: str | None = Header(default=None)) -> None:
    """FastAPI dependency. Attach to routers, not individual routes.

    Behavior:
      - AGENT_SERVICE_TOKEN unset + FAIL_OPEN=True  → pass (dev grace)
      - AGENT_SERVICE_TOKEN unset + FAIL_OPEN=False → 503 (closed, default)
      - AGENT_SERVICE_TOKEN set + missing header    → 401
      - AGENT_SERVICE_TOKEN set + wrong header      → 403
      - AGENT_SERVICE_TOKEN set + matching header   → pass
    """
    expected = settings.AGENT_SERVICE_TOKEN
    if not expected:
        if settings.AGENT_SERVICE_TOKEN_FAIL_OPEN:
            return
        raise HTTPException(status_code=503, detail="Service token not configured")
    if x_service_token is None:
        raise HTTPException(status_code=401, detail="Missing X-Service-Token header")
    if not hmac.compare_digest(x_service_token, expected):
        raise HTTPException(status_code=403, detail="Invalid service token")


def log_startup_state() -> None:
    """Called once from main.py lifespan to surface the auth posture in deploy logs."""
    if settings.AGENT_SERVICE_TOKEN:
        log.info("service_token_auth_enabled")
    elif settings.AGENT_SERVICE_TOKEN_FAIL_OPEN:
        log.warning(
            "service_token_auth_fail_open",
            reason="AGENT_SERVICE_TOKEN unset but AGENT_SERVICE_TOKEN_FAIL_OPEN=True — "
            "accepting all /agent/* requests. Acceptable for local dev only.",
        )
    else:
        log.error(
            "service_token_auth_misconfigured",
            reason="AGENT_SERVICE_TOKEN is unset and fail-open is disabled — "
            "every /agent/* request will return 503 until configured.",
        )
