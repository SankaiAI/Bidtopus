import asyncio
import json

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
from db.session import get_db
from models.schemas import ChatRequest
from services.contract_service import require_contract_owner
from config import settings

router = APIRouter(prefix="/api/contracts", tags=["stream"])
_anthropic = Anthropic(api_key=settings.anthropic_api_key)


# ── SSE live event stream ─────────────────────────────────────────────────────

@router.get("/{contract_id}/events")
async def stream_events(
    contract_id: str,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_contract_owner(db, contract_id, current_user)

    async def generator():
        q = event_bus.subscribe(contract_id)
        try:
            last_id = messages_repo.get_latest_id(db, contract_id)
            while True:
                # Drain thinking events pushed by background threads first
                while not q.empty():
                    yield q.get_nowait()

                # Poll DB for new persisted messages
                new_msgs = (
                    messages_repo.get_after_id(db, contract_id, last_id)
                    if last_id
                    else messages_repo.get_all(db, contract_id)
                )
                for msg in new_msgs:
                    yield {
                        "event": msg.type,
                        "data": json.dumps({
                            "id": msg.id,
                            "role": msg.role,
                            "type": msg.type,
                            "content": msg.content,
                            "metadata": msg.extra,
                            "status": msg.status,
                            "created_at": msg.created_at.isoformat(),
                        }),
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
    audit_context = repo.get_audit_events_since(db, contract_id, days_ago=3)
    context_snippets = [
        f"[{e.component}/{e.event_type}] {json.dumps(e.payload)[:300]}"
        for e in audit_context[-20:]
    ]

    async def generate():
        try:
            full_response = ""
            aborted = False
            with _anthropic.messages.stream(
                model="claude-sonnet-4-6",
                max_tokens=1024,
                system=(
                    "You are the OutcomeX performance-marketing agent. "
                    "Answer the merchant's question about their contract. "
                    "Do not execute any actions — this is a read-only Q&A."
                ),
                messages=[{
                    "role": "user",
                    "content": (
                        f"Contract status: {contract.status}\n"
                        f"Recent activity:\n" + "\n".join(context_snippets) +
                        f"\n\nMerchant question: {clean_message}"
                    ),
                }],
            ) as stream:
                for text in stream.text_stream:
                    if await request.is_disconnected():
                        aborted = True
                        stream.close()
                        break
                    full_response += text
                    yield f"event: text\ndata: {json.dumps({'delta': text})}\n\n"

            if not aborted:
                sanitized = bleach.clean(full_response, tags=[], strip=True)
                messages_repo.append(db, contract_id, "agent", "message", content=sanitized)

        except Exception as e:
            yield f"event: error\ndata: {json.dumps({'message': str(e)})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
