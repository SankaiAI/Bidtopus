from eth_account import Account
from eth_account.messages import encode_defunct
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import db.repo as repo
from auth.clerk import get_current_user
from db.session import get_db
from models.schemas import UserResponse, WalletConnectRequest

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("/me", response_model=UserResponse)
def get_me(current_user=Depends(get_current_user)):
    return current_user


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
