import base64
import json
import logging

from slowapi import Limiter
from slowapi.util import get_remote_address

log = logging.getLogger(__name__)


def _user_or_ip(request) -> str:
    """Rate-limit key (H-3 from security review).

    Prefer the Clerk user sub from the bearer token over source IP. Behind a load
    balancer / reverse proxy without proper X-Forwarded-For trust, all requests
    share one IP and the per-IP limit becomes a per-app limit — trivially
    exhausted by any single tenant.

    We deliberately do NOT verify the JWT signature here. The full verification
    happens inside auth.clerk.get_current_user when the route runs — if the token
    is forged, the route returns 401. The rate limiter just needs a stable per-user
    bucket; an attacker forging a `sub` claim to evade rate limits would still get
    401 from auth. Skipping verification keeps this fast (no crypto per request).

    Falls back to remote IP when no Authorization header is present (health
    checks, unauthenticated probes, service-token-only paths).
    """
    auth = request.headers.get("authorization") or request.headers.get("Authorization")
    if auth and auth.lower().startswith("bearer "):
        token = auth[7:].strip()
        # JWT = header.payload.signature, all base64url-encoded
        parts = token.split(".")
        if len(parts) == 3:
            try:
                payload_b64 = parts[1] + "=" * (-len(parts[1]) % 4)
                payload = json.loads(base64.urlsafe_b64decode(payload_b64))
                sub = payload.get("sub")
                if sub:
                    return f"user:{sub}"
            except Exception:
                pass  # malformed token — fall through to IP
    return f"ip:{get_remote_address(request)}"


limiter = Limiter(key_func=_user_or_ip, storage_uri="memory://", config_filename=None)
