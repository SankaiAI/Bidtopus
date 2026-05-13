import logging
from clerk_backend_api import authenticate_request
from clerk_backend_api.security.types import AuthenticateRequestOptions
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPBearer
from sqlalchemy.orm import Session

from config import settings
from db.session import get_db
import db.repo as repo

log = logging.getLogger(__name__)
bearer = HTTPBearer()

_clerk_options = AuthenticateRequestOptions(secret_key=settings.clerk_secret_key)


async def get_current_user(request: Request, db: Session = Depends(get_db)):
    state = authenticate_request(request, _clerk_options)
    if not state.is_signed_in:
        log.warning("Clerk auth failed: %s", state.message)
        raise HTTPException(status_code=401, detail="Invalid or expired Clerk session token")

    claims = state.payload
    user = repo.get_or_create_user(
        db,
        clerk_user_id=claims["sub"],
        email=claims.get("email", ""),
    )
    return user
