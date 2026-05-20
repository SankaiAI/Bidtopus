from eth_account import Account
from eth_account.messages import encode_defunct
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

import db.repo as repo
from auth.clerk import get_current_user
from db.session import get_db
from models.schemas import (
    MetaAdsAccountCreateRequest,
    MetaAdsAccountResponse,
    UserResponse,
    UserSettingsRequest,
    WalletConnectRequest,
)

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


@router.post("/me/wallet", response_model=UserResponse)
def connect_wallet(
    body: WalletConnectRequest,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    msg = encode_defunct(text=f"Connect wallet to OutcomeX {current_user.clerk_user_id}")
    try:
        recovered = Account.recover_message(msg, signature=body.signature)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid wallet signature")

    if recovered.lower() != body.wallet_address.lower():
        raise HTTPException(status_code=400, detail="Wallet signature verification failed")

    user = repo.update_wallet_address(db, current_user.id, body.wallet_address)
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
    if account.merchant_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized for this account")
    repo.delete_meta_account(db, account_id)
    return Response(status_code=204)
