"""
Service-to-service auth for the agent → backend channel.

The agent doesn't have a Clerk session — it's a peer service. Calls that
originate from it (currently: performance snapshot ingest) carry an
`X-Service-Token` header whose value must match `settings.agent_service_token`.

If the token is unset in env, the backend refuses every service call —
configuration error rather than silent passthrough.
"""
import hmac

from fastapi import Header, HTTPException

from config import settings


def verify_service_token(x_service_token: str | None = Header(default=None)) -> None:
    expected = settings.agent_service_token
    if not expected:
        # Misconfiguration — fail closed rather than silently accept anything.
        raise HTTPException(status_code=503, detail="Service token not configured")
    if x_service_token is None:
        raise HTTPException(status_code=401, detail="Missing X-Service-Token header")
    if not hmac.compare_digest(x_service_token, expected):
        raise HTTPException(status_code=403, detail="Invalid service token")
