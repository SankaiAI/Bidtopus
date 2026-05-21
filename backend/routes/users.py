import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from siwe import SiweMessage, ExpiredMessage, DomainMismatch, MalformedSession, VerificationError
from siwe import generate_nonce as siwe_generate_nonce
from sqlalchemy.orm import Session

import db.repo as repo
from auth.clerk import get_current_user
from config import settings
from db.session import get_db
from models.schemas import (
    MetaAdsAccountCreateRequest,
    MetaAdsAccountResponse,
    UserResponse,
    UserSettingsRequest,
    WalletConnectRequest,
    WalletNonceResponse,
)

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("/me", response_model=UserResponse)
def get_me(current_user=Depends(get_current_user)):
    return current_user


@router.patch("/me/settings", response_model=UserResponse)
def update_settings(
    body: UserSettingsRequest,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    updates = body.model_dump(exclude_none=True)
    if not updates:
        return current_user
    return repo.update_user_settings(db, current_user.id, **updates)


@router.post("/me/wallet/nonce", response_model=WalletNonceResponse)
def issue_wallet_nonce(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Mint a single-use, time-bound nonce for SIWE wallet-connect (#84)."""
    # siwe.generate_nonce() returns an alphanumeric token that matches the SIWE
    # spec — secrets.token_urlsafe() can include `-`/`_` which the SIWE parser rejects.
    nonce = siwe_generate_nonce()
    row = repo.create_wallet_nonce(db, current_user.clerk_user_id, nonce)
    return WalletNonceResponse(
        nonce=nonce,
        issued_at=row.issued_at,
        ttl_seconds=settings.siwe_nonce_ttl_seconds,
    )


@router.post("/me/wallet", response_model=UserResponse)
def connect_wallet(
    request: Request,
    body: WalletConnectRequest,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """SIWE-based wallet connect (#84).

    Verifies in order:
    1. message parses as a valid SIWE message
    2. message.nonce was minted by /nonce for this user, not consumed, within TTL
    3. message.domain matches the configured siwe_domain
    4. message.chain_id matches the configured arc_chain_id
    5. signature recovers to message.address (siwe lib does this)
    6. body.wallet_address matches message.address
    Marks nonce consumed on success.
    """
    # 1. Parse
    try:
        siwe = SiweMessage.from_message(body.message)
    except Exception:
        log.warning("SIWE parse failed user=%s", current_user.clerk_user_id)
        raise HTTPException(status_code=400, detail="Invalid SIWE message format")

    # 2. Nonce: must exist, belong to this user, be unused, be unexpired
    nonce_row = repo.get_wallet_nonce(db, siwe.nonce)
    if nonce_row is None or nonce_row.clerk_user_id != current_user.clerk_user_id:
        raise HTTPException(status_code=400, detail="Unknown or unauthorized nonce")
    if nonce_row.used_at is not None:
        raise HTTPException(status_code=400, detail="Nonce already consumed")
    issued_at = nonce_row.issued_at
    if issued_at.tzinfo is None:
        issued_at = issued_at.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) - issued_at > timedelta(seconds=settings.siwe_nonce_ttl_seconds):
        raise HTTPException(status_code=400, detail="Nonce expired — request a new one")

    # 3. Domain
    if siwe.domain != settings.siwe_domain:
        log.warning("SIWE domain mismatch expected=%s got=%s", settings.siwe_domain, siwe.domain)
        raise HTTPException(status_code=400, detail="Domain mismatch in SIWE message")

    # 4. Chain id
    if siwe.chain_id != settings.arc_chain_id:
        raise HTTPException(status_code=400, detail="Chain id mismatch in SIWE message")

    # 5. Signature (this is the cryptographic check)
    try:
        siwe.verify(body.signature)
    except (VerificationError, ExpiredMessage, DomainMismatch, MalformedSession):
        log.warning("SIWE verify failed user=%s", current_user.clerk_user_id)
        raise HTTPException(status_code=400, detail="SIWE signature verification failed")
    except Exception:
        log.exception("SIWE verify unexpected error user=%s", current_user.clerk_user_id)
        raise HTTPException(status_code=400, detail="SIWE signature verification failed")

    # 6. Body must agree with signed message
    if siwe.address.lower() != body.wallet_address.lower():
        raise HTTPException(status_code=400, detail="wallet_address does not match signed message")

    # All checks passed — consume the nonce and persist the wallet
    repo.consume_wallet_nonce(db, nonce_row.id, datetime.now(timezone.utc))
    user = repo.update_wallet_address(db, current_user.id, body.wallet_address)
    log.info("wallet connected user=%s wallet=%s", current_user.clerk_user_id, body.wallet_address)
    return user


# ── Meta Ads Accounts ─────────────────────────────────────────────────────────

@router.get("/me/meta-accounts", response_model=list[MetaAdsAccountResponse])
def list_my_meta_accounts(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return repo.list_meta_accounts(db, current_user.id)


@router.post("/me/meta-accounts", response_model=MetaAdsAccountResponse, status_code=201)
def connect_meta_account(
    body: MetaAdsAccountCreateRequest,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    existing = repo.get_meta_account_by_external_id(
        db, current_user.id, body.meta_ads_account_id,
    )
    if existing is not None:
        # Idempotent — re-connecting the same Meta account returns the existing row.
        return existing
    return repo.create_meta_account(
        db, current_user.id, body.meta_ads_account_id, body.name,
    )


@router.delete("/me/meta-accounts/{account_id}", status_code=204)
def disconnect_meta_account(
    account_id: str,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    account = repo.get_meta_account(db, account_id)
    if account is None:
        return Response(status_code=204)
    if str(account.merchant_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Not authorized for this account")
    repo.delete_meta_account(db, account_id)
    return Response(status_code=204)
