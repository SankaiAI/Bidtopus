"""Chat Q&A endpoint — merchant-facing conversational interface.

Grounded in real tool results from the DB; never fabricates contract data.
Separate from negotiation loop and background scheduler (CLAUDE.md rule 7).
"""
from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from db.session import get_db
from llm.chat import ChatAgent
from utils.logging import attach_session, get_logger

logger = get_logger(__name__)
router = APIRouter(prefix="/agent/chat", tags=["chat"])

_SSE_HEADERS = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}


# ── Request / response schemas ─────────────────────────────────────────────────

class ChatRequest(BaseModel):
    contract_id: str
    message: str
    prior_messages: list[dict] | None = None


class ChatResponse(BaseModel):
    response: str
    tools_called: list[str]


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("", response_model=ChatResponse)
def chat(body: ChatRequest, db: Session = Depends(get_db)):
    """Grounded chat — LLM calls get_contract_context before answering."""
    attach_session(body.contract_id)
    logger.info("chat_request", contract_id=body.contract_id, message_len=len(body.message))

    agent = ChatAgent(db)
    try:
        response_text, tools_called = agent.respond(
            contract_id=body.contract_id,
            user_message=body.message,
            prior_messages=body.prior_messages,
        )
    except Exception as exc:
        logger.error("chat_error", contract_id=body.contract_id, error=str(exc))
        raise HTTPException(status_code=500, detail=str(exc))

    logger.info(
        "chat_complete",
        contract_id=body.contract_id,
        tools_called=tools_called,
        response_len=len(response_text),
    )
    return ChatResponse(response=response_text, tools_called=tools_called)


@router.post("/stream")
def chat_stream(body: ChatRequest, db: Session = Depends(get_db)):
    """SSE variant — streams tool_call events then text_delta events."""
    attach_session(body.contract_id)
    logger.info("chat_stream_request", contract_id=body.contract_id)

    agent = ChatAgent(db)

    def gen():
        try:
            yield from agent.stream_respond(
                contract_id=body.contract_id,
                user_message=body.message,
                prior_messages=body.prior_messages,
            )
        except Exception as exc:
            logger.error("chat_stream_error", contract_id=body.contract_id, error=str(exc))
            yield f"event: error\ndata: {json.dumps({'detail': str(exc)})}\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream", headers=_SSE_HEADERS)
