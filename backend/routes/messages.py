from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

import bleach
import db.messages_repo as messages_repo
from auth.clerk import get_current_user
from db.session import get_db
from models.schemas import MessageCreateRequest, MessageResponse
from services.contract_service import require_contract_owner

router = APIRouter(prefix="/api/contracts", tags=["messages"])


@router.get("/{contract_id}/messages")
def get_messages(
    contract_id: str,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_contract_owner(db, contract_id, current_user)
    msgs = messages_repo.get_all(db, contract_id)
    return [MessageResponse.model_validate(m) for m in msgs]


@router.post("/{contract_id}/messages", status_code=201)
def post_message(
    contract_id: str,
    body: MessageCreateRequest,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_contract_owner(db, contract_id, current_user)
    clean_content = bleach.clean(body.message, tags=[], strip=True)
    msg = messages_repo.append(db, contract_id, "merchant", "message", content=clean_content)
    return MessageResponse.model_validate(msg)
