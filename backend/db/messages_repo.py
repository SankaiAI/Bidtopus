from typing import Optional

from sqlalchemy.orm import Session

from db.models import ContractMessage


def append(
    db: Session,
    contract_id: str,
    role: str,
    msg_type: str,
    content: str,
    extra: Optional[dict] = None,
    status: Optional[str] = None,
) -> ContractMessage:
    msg = ContractMessage(
        contract_id=contract_id,
        role=role,
        type=msg_type,
        content=content,
        extra=extra,
        status=status,
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return msg


def get_all(db: Session, contract_id: str) -> list[ContractMessage]:
    return (
        db.query(ContractMessage)
        .filter(ContractMessage.contract_id == contract_id)
        .order_by(ContractMessage.created_at.asc())
        .all()
    )


def get_after_id(db: Session, contract_id: str, after_id: str) -> list[ContractMessage]:
    anchor = db.query(ContractMessage).filter(ContractMessage.id == after_id).first()
    if anchor is None:
        return get_all(db, contract_id)
    return (
        db.query(ContractMessage)
        .filter(
            ContractMessage.contract_id == contract_id,
            ContractMessage.created_at > anchor.created_at,
        )
        .order_by(ContractMessage.created_at.asc())
        .all()
    )


def get_latest_id(db: Session, contract_id: str) -> Optional[str]:
    msg = (
        db.query(ContractMessage)
        .filter(ContractMessage.contract_id == contract_id)
        .order_by(ContractMessage.created_at.desc())
        .first()
    )
    return msg.id if msg else None


def update_status(db: Session, message_id: str, status: str) -> ContractMessage:
    msg = db.query(ContractMessage).filter(ContractMessage.id == message_id).first()
    if msg is None:
        raise ValueError(f"Message {message_id} not found")
    msg.status = status
    db.commit()
    db.refresh(msg)
    return msg
