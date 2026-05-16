import asyncio
import json
import logging

import bleach
from anthropic import Anthropic
from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from sse_starlette.sse import EventSourceResponse
from sqlalchemy.orm import Session

from limiter import limiter

import db.messages_repo as messages_repo
import db.repo as repo
import event_bus
from auth.clerk import get_current_user
from db.session import get_db, SessionLocal
from models.schemas import ChatRequest
from services.contract_service import require_contract_owner
from config import settings

router = APIRouter(prefix="/api/contracts", tags=["stream"])
log = logging.getLogger(__name__)
_anthropic = Anthropic(api_key=settings.anthropic_api_key)


# ── SSE live event stream ─────────────────────────────────────────────────────

@router.get("/{contract_id}/events")
async def stream_events(
    contract_id: str,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_contract_owner(db, contract_id, current_user)
    initial_last_id = messages_repo.get_latest_id(db, contract_id)
    db.close()  # release pool connection before entering the infinite SSE loop

    async def generator():
        q = event_bus.subscribe(contract_id)
        try:
            last_id = initial_last_id
            while True:
                # Drain thinking events pushed by background threads first
                while not q.empty():
                    yield q.get_nowait()

                # Short-lived session per poll — never held across asyncio.sleep
                poll_db = SessionLocal()
                try:
                    new_msgs = (
                        messages_repo.get_after_id(poll_db, contract_id, last_id)
                        if last_id
                        else messages_repo.get_all(poll_db, contract_id)
                    )
                    msgs_snapshot = list(new_msgs)
                finally:
                    poll_db.close()

                for msg in msgs_snapshot:
                    yield {
                        "event": msg.type,
                        "data": json.dumps({
                            "id": str(msg.id),
                            "role": msg.role,
                            "type": msg.type,
                            "content": msg.content,
                            "metadata": msg.extra,
                            "status": msg.status,
                            "created_at": msg.created_at.isoformat(),
                        }, default=str),
                    }
                    last_id = msg.id
                await asyncio.sleep(1)
        finally:
            event_bus.unsubscribe(contract_id, q)

    return EventSourceResponse(generator())


# ── LLM streaming chat ────────────────────────────────────────────────────────

@router.post("/{contract_id}/chat/stream")
@limiter.limit("20/minute")
async def stream_chat(
    request: Request,
    contract_id: str,
    body: ChatRequest,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_contract_owner(db, contract_id, current_user)

    clean_message = bleach.clean(body.message, tags=[], strip=True)
    messages_repo.append(db, contract_id, "merchant", "message", content=clean_message)

    contract = repo.get_contract(db, contract_id)
    contract_status = contract.status

    # Build full conversation history (negotiation + workspace) for LLM context
    all_msgs = messages_repo.get_all(db, contract_id)
    llm_messages = [
        {
            "role": "user" if m.role == "merchant" else "assistant",
            "content": m.content,
        }
        for m in all_msgs
        if m.type == "message" and m.content
    ]
    db.close()  # release pool connection before streaming from Anthropic

    async def generate():
        try:
            full_response = ""
            aborted = False
            log.debug("LLM input [chat] contract=%s messages=%d:\n%s",
                      contract_id, len(llm_messages), json.dumps(llm_messages, indent=2, default=str))
            with _anthropic.messages.stream(
                model="claude-sonnet-4-6",
                max_tokens=1024,
                system=(
                    "You are the OutcomeX performance-marketing agent. "
                    f"The contract is currently in status: {contract_status}. "
                    "Answer the merchant's questions based on your shared conversation history. "
                    "Do not execute any actions — this is a read-only Q&A."
                ),
                messages=llm_messages,
            ) as stream:
                for text in stream.text_stream:
                    if await request.is_disconnected():
                        aborted = True
                        stream.close()
                        break
                    full_response += text
                    yield f"event: text\ndata: {json.dumps({'delta': text})}\n\n"

            if not aborted:
                log.debug("LLM output [chat] contract=%s:\n%s", contract_id, full_response)
                log.debug("LLM output [chat] repr: %s", repr(full_response))
                sanitized = bleach.clean(full_response, tags=[], strip=True)
                write_db = SessionLocal()
                try:
                    messages_repo.append(write_db, contract_id, "agent", "message", content=sanitized)
                finally:
                    write_db.close()

        except Exception as e:
            yield f"event: error\ndata: {json.dumps({'message': str(e)})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
