"""Service-to-service auth for the backend → agent channel.

The backend signs every call into /agent/* with an `X-Service-Token` header.
We verify it using `hmac.compare_digest` against `settings.AGENT_SERVICE_TOKEN`.
The env var name and value MUST match the backend's `AGENT_SERVICE_TOKEN`.

## Rollout grace

If `AGENT_SERVICE_TOKEN` is unset on the agent side, this dependency
**fails open**: it accepts any (or no) header and logs a single startup
warning. This keeps the agent reachable while the env var rolls out across
environments — backend already sends the header when its own var is set,
agent agrees to ignore it until both sides are configured.

Once both sides have the secret deployed, flip `_FAIL_OPEN_WHEN_UNSET` to
False (or delete the branch entirely) — that's the one-line follow-up
mentioned in issue #85's DoD.
"""
from __future__ import annotations

import hmac

from fastapi import Header, HTTPException

from config import settings
from utils.logging import get_logger

log = get_logger(__name__)

# Set to False to require AGENT_SERVICE_TOKEN at every request even when unset.
# Currently True so that misconfigured-but-deployed environments don't 401
# every call. After the secret is rolled out to all envs, flip to False.
_FAIL_OPEN_WHEN_UNSET = True


def verify_service_token(x_service_token: str | None = Header(default=None)) -> None:
    """FastAPI dependency. Attach to routers, not individual routes.

    Behavior:
      - AGENT_SERVICE_TOKEN unset + _FAIL_OPEN_WHEN_UNSET=True  → pass (grace)
      - AGENT_SERVICE_TOKEN unset + _FAIL_OPEN_WHEN_UNSET=False → 503 (closed)
      - AGENT_SERVICE_TOKEN set + missing header                → 401
      - AGENT_SERVICE_TOKEN set + wrong header                  → 403
      - AGENT_SERVICE_TOKEN set + matching header               → pass
    """
    expected = settings.AGENT_SERVICE_TOKEN
    if not expected:
        if _FAIL_OPEN_WHEN_UNSET:
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
    elif _FAIL_OPEN_WHEN_UNSET:
        log.warning(
            "service_token_auth_fail_open",
            reason="AGENT_SERVICE_TOKEN is unset — accepting all /agent/* "
            "requests (rollout grace). Set the env var on both backend and "
            "agent, then flip _FAIL_OPEN_WHEN_UNSET to False.",
        )
    else:
        log.error(
            "service_token_auth_misconfigured",
            reason="AGENT_SERVICE_TOKEN is unset and fail-open disabled — "
            "every /agent/* request will return 503 until configured.",
        )
