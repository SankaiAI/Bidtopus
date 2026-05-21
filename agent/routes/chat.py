"""Chat Q&A endpoint — merchant-facing conversational interface.

Grounded in real tool results from the DB; never fabricates contract data.
Separate from negotiation loop and background scheduler (CLAUDE.md rule 7).
"""
from __future__ import annotations

import json
import uuid as _uuid_lib
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import UUID4, BaseModel, Field
from sqlalchemy.orm import Session

from auth.service_token import verify_service_token
from db.session import get_db
from llm.chat import ChatAgent
from utils.logging import attach_session, get_logger

logger = get_logger(__name__)
# Router-level dependency: see routes/agent.py for context.
router = APIRouter(
    prefix="/agent/chat",
    tags=["chat"],
    dependencies=[Depends(verify_service_token)],
)

_SSE_HEADERS = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}


# ── Request / response schemas ─────────────────────────────────────────────────

class ChatRequest(BaseModel):
    # UUID4 validates format → 422 on garbage instead of leaking ValueError text
    contract_id: UUID4
    message: Annotated[str, Field(min_length=1, max_length=4000)]
    # `prior_messages` is intentionally NOT accepted from the client. History
    # is re-derived server-side from contract_messages so callers cannot inject
    # fake assistant turns or tool_use blocks (prompt-injection vector).


class ChatResponse(BaseModel):
    response: str
    tools_called: list[str]


# ── Endpoints ──────────────────────────────────────────────────────────────────

def _generic_chat_error(exc: Exception, contract_id: str) -> HTTPException:
    correlation_id = _uuid_lib.uuid4().hex[:12]
    logger.error(
        "chat_error",
        contract_id=contract_id,
        correlation_id=correlation_id,
        error=str(exc),
        error_type=type(exc).__name__,
    )
    return HTTPException(
        status_code=500,
        detail={
            "message": "Chat error. See agent logs for correlation_id.",
            "correlation_id": correlation_id,
        },
    )


@router.post("", response_model=ChatResponse)
def chat(body: ChatRequest, db: Session = Depends(get_db)):
    """Grounded chat — LLM calls get_contract_context before answering."""
    contract_id = str(body.contract_id)
    attach_session(contract_id)
    logger.info("chat_request", contract_id=contract_id, message_len=len(body.message))

    agent = ChatAgent(db)
    try:
        response_text, tools_called = agent.respond(
            contract_id=contract_id,
            user_message=body.message,
        )
    except Exception as exc:
        raise _generic_chat_error(exc, contract_id) from exc

    logger.info(
        "chat_complete",
        contract_id=contract_id,
        tools_called=tools_called,
        response_len=len(response_text),
    )
    return ChatResponse(response=response_text, tools_called=tools_called)


@router.post("/stream")
def chat_stream(body: ChatRequest, db: Session = Depends(get_db)):
    """SSE variant — streams tool_call events then text_delta events."""
    contract_id = str(body.contract_id)
    attach_session(contract_id)
    logger.info("chat_stream_request", contract_id=contract_id)

    agent = ChatAgent(db)

    def gen():
        try:
            yield from agent.stream_respond(
                contract_id=contract_id,
                user_message=body.message,
            )
        except Exception as exc:
            correlation_id = _uuid_lib.uuid4().hex[:12]
            logger.error(
                "chat_stream_error",
                contract_id=contract_id,
                correlation_id=correlation_id,
                error=str(exc),
                error_type=type(exc).__name__,
            )
            payload = json.dumps({
                "detail": "Chat stream error. See agent logs for correlation_id.",
                "correlation_id": correlation_id,
            })
            yield f"event: error\ndata: {payload}\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream", headers=_SSE_HEADERS)
