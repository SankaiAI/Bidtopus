"""Service-to-service auth for inbound calls into the agent.

The backend signs every call with `X-Service-Token`. We verify it here.
See `verify_service_token` for the dependency used by FastAPI routers.
"""
from auth.service_token import verify_service_token

__all__ = ["verify_service_token"]
