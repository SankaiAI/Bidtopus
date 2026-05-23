"""
Meta Ads OAuth popup flow (issue #91).

GET /api/auth/meta/url
    Clerk-authenticated. Returns the Facebook OAuth URL the frontend opens in a popup.

GET /api/auth/meta/callback?code=...&state=...
    OAuth redirect handler (no Clerk token — identity travels in the signed state).
    Exchanges code → access token → ad accounts → persists via repo.create_meta_account.
    Redirects popup to frontend /auth/meta/success (or /auth/meta/error on failure).

Mock mode (META_APP_ID unset):
    url      → points straight at /callback?code=mock so local dev works without a real app
    callback → skips Graph API; seeds act_000000000 "Mock Ad Account (dev)"
"""

import base64
import hashlib
import hmac
import json
import logging
import time
import urllib.parse

import httpx
from fastapi import APIRouter, Depends
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

import db.repo as repo
from auth.clerk import get_current_user
from config import settings
from db.session import get_db

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth/meta", tags=["meta-auth"])

_GRAPH_API = "https://graph.facebook.com/v19.0"
_FB_OAUTH   = "https://www.facebook.com/dialog/oauth"
_SCOPES     = "ads_read,ads_management"
_STATE_TTL  = 600  # seconds


# ── State signing ─────────────────────────────────────────────────────────────

def _signing_key() -> bytes:
    return (settings.meta_app_secret or "mock-dev-secret").encode()


def _make_state(clerk_user_id: str) -> str:
    payload = json.dumps({"uid": clerk_user_id, "ts": int(time.time())})
    sig = hmac.new(_signing_key(), payload.encode(), hashlib.sha256).hexdigest()
    return base64.urlsafe_b64encode(f"{payload}|{sig}".encode()).decode()


def _verify_state(state: str) -> str:
    """Returns clerk_user_id or raises ValueError."""
    try:
        raw = base64.urlsafe_b64decode(state.encode()).decode()
        payload, sig = raw.rsplit("|", 1)
        expected = hmac.new(_signing_key(), payload.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected):
            raise ValueError("signature mismatch")
        data = json.loads(payload)
        if int(time.time()) - data["ts"] > _STATE_TTL:
            raise ValueError("state expired")
        return data["uid"]
    except (ValueError, KeyError) as exc:
        raise ValueError(f"invalid state: {exc}") from exc


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/url")
def meta_oauth_url(current_user=Depends(get_current_user)):
    """Return the Facebook OAuth URL the frontend should open in a 600×700 popup."""
    state = _make_state(current_user.clerk_user_id)

    if not settings.meta_app_id:
        # Mock mode — callback URL points at our own endpoint with code=mock
        callback = (
            f"{settings.meta_redirect_uri}"
            f"?code=mock&state={urllib.parse.quote(state)}"
        )
        log.info("meta_oauth_url mock_mode user=%s", current_user.clerk_user_id)
        return {"url": callback}

    params = {
        "client_id":     settings.meta_app_id,
        "redirect_uri":  settings.meta_redirect_uri,
        "scope":         _SCOPES,
        "state":         state,
        "response_type": "code",
    }
    url = f"{_FB_OAUTH}?{urllib.parse.urlencode(params)}"
    log.info("meta_oauth_url real_mode user=%s", current_user.clerk_user_id)
    return {"url": url}


@router.get("/callback")
def meta_oauth_callback(
    code: str,
    state: str,
    db: Session = Depends(get_db),
):
    """
    OAuth redirect from Facebook. No Clerk token — identity comes from the
    HMAC-signed state parameter minted by /url.
    """
    success_url = f"{settings.origins[0]}/auth/meta/success"
    error_url   = f"{settings.origins[0]}/auth/meta/error"

    # 1. Verify state and resolve user
    try:
        clerk_user_id = _verify_state(state)
    except ValueError as exc:
        log.warning("meta_oauth_callback bad_state: %s", exc)
        return RedirectResponse(error_url)

    user = repo.get_user_by_clerk_id(db, clerk_user_id)
    if user is None:
        log.warning("meta_oauth_callback no_user clerk_id=%s", clerk_user_id)
        return RedirectResponse(error_url)

    # 2. Mock mode — seed a fake account and close the popup
    if code == "mock" or not settings.meta_app_id:
        repo.create_meta_account(db, user.id, "act_000000000", "Mock Ad Account (dev)")
        log.info("meta_oauth_callback mock_account_seeded user=%s", clerk_user_id)
        return RedirectResponse(success_url)

    # 3. Exchange code for access token
    try:
        token_resp = httpx.get(
            f"{_GRAPH_API}/oauth/access_token",
            params={
                "client_id":     settings.meta_app_id,
                "client_secret": settings.meta_app_secret,
                "redirect_uri":  settings.meta_redirect_uri,
                "code":          code,
            },
            timeout=10,
        )
        token_resp.raise_for_status()
        access_token = token_resp.json()["access_token"]
    except Exception as exc:
        log.error("meta_oauth_callback token_exchange_failed user=%s: %s", clerk_user_id, exc)
        return RedirectResponse(error_url)

    # 4. Fetch the merchant's ad accounts from Graph API
    try:
        accounts_resp = httpx.get(
            f"{_GRAPH_API}/me/adaccounts",
            params={
                "fields":       "id,name,account_status",
                "access_token": access_token,
            },
            timeout=10,
        )
        accounts_resp.raise_for_status()
        accounts = accounts_resp.json().get("data", [])
    except Exception as exc:
        log.error("meta_oauth_callback adaccounts_fetch_failed user=%s: %s", clerk_user_id, exc)
        return RedirectResponse(error_url)

    # 5. Persist — create_meta_account is idempotent (re-connecting refreshes the token)
    stored = 0
    for acc in accounts:
        account_id = acc.get("id")
        name = acc.get("name") or account_id
        if account_id:
            repo.create_meta_account(db, user.id, account_id, name, access_token=access_token)
            stored += 1

    log.info("meta_oauth_callback stored=%d user=%s", stored, clerk_user_id)
    return RedirectResponse(success_url)
