import asyncio
import json
import logging

import bleach
import httpx
from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from sse_starlette.sse import EventSourceResponse
from sqlalchemy.orm import Session

from limiter import limiter

import db.messages_repo as messages_repo
import event_bus
from auth.clerk import get_current_user
from db.session import get_db, SessionLocal
from models.schemas import ChatRequest
from services.contract_service import require_contract_owner
from config import settings

router = APIRouter(prefix="/api/contracts", tags=["stream"])
log = logging.getLogger(__name__)


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

    # Build conversation history so the agent has turn-by-turn context
    all_msgs = messages_repo.get_all(db, contract_id)
    prior_messages = [
        {"role": "user" if m.role == "merchant" else "assistant", "content": m.content}
        for m in all_msgs
        if m.type == "message" and m.content
    ]
    db.close()

    async def generate():
        full_response = ""
        try:
            # M-3 — send service token on backend→agent calls.
            _service_headers = (
                {"X-Service-Token": settings.agent_service_token}
                if settings.agent_service_token else {}
            )
            async with httpx.AsyncClient(timeout=60.0) as client:
                async with client.stream(
                    "POST",
                    f"{settings.agent_base_url}/agent/chat/stream",
                    json={
                        "contract_id": contract_id,
                        "message": clean_message,
                        "prior_messages": prior_messages,
                    },
                    headers=_service_headers,
                ) as agent_resp:
                    agent_resp.raise_for_status()
                    buffer = ""
                    async for chunk in agent_resp.aiter_text():
                        if await request.is_disconnected():
                            break
                        buffer += chunk
                        # Parse complete SSE blocks (double-newline separated)
                        while "\n\n" in buffer:
                            block, buffer = buffer.split("\n\n", 1)
                            event_type, event_data = "message", ""
                            for line in block.split("\n"):
                                if line.startswith("event: "):
                                    event_type = line[7:].strip()
                                elif line.startswith("data: "):
                                    event_data = line[6:].strip()
                            if not event_data:
                                continue
                            if event_type == "text_delta":
                                # Agent emits text_delta+{"text":"..."};
                                # frontend useMessages expects text+{"delta":"..."}
                                text = json.loads(event_data).get("text", "")
                                full_response += text
                                yield f"event: text\ndata: {json.dumps({'delta': text})}\n\n"
                            elif event_type == "error":
                                detail = json.loads(event_data).get("detail", event_data)
                                yield f"event: error\ndata: {json.dumps({'message': detail})}\n\n"
                            elif event_type in ("tool_call", "done"):
                                yield f"event: {event_type}\ndata: {event_data}\n\n"

            if full_response:
                sanitized = bleach.clean(full_response, tags=[], strip=True)
                write_db = SessionLocal()
                try:
                    messages_repo.append(write_db, contract_id, "agent", "message", content=sanitized)
                finally:
                    write_db.close()

        except Exception:
            # Log full exception server-side; return a generic error to the client to
            # avoid leaking exception strings (which can carry stack traces, paths, or
            # internal config). The contract_id in logs is enough to find this case.
            log.exception("stream_chat: agent proxy failed contract=%s", contract_id)
            yield (
                "event: error\n"
                f"data: {json.dumps({'message': 'Agent service error — please retry'})}\n\n"
            )

    return StreamingResponse(generate(), media_type="text/event-stream")
