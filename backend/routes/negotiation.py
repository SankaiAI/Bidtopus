import asyncio
import json
import logging
import random

import bleach
from anthropic import Anthropic, APIStatusError
from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from limiter import limiter
import db.messages_repo as messages_repo
import db.repo as repo
from auth.clerk import get_current_user
from db.session import get_db
from models.schemas import NegotiationRequest
from services.contract_service import require_contract_owner
from config import settings

router = APIRouter(prefix="/api", tags=["negotiation"])
_anthropic = Anthropic(api_key=settings.anthropic_api_key)
log = logging.getLogger(__name__)

_TITLE_PROMPT = (
    "Generate a 4-6 word title for a marketing campaign workspace based on this "
    "user message: {message}. Return only the title, no punctuation, no quotes."
)


async def _generate_title(user_message: str) -> str:
    def _call():
        resp = _anthropic.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=20,
            messages=[{"role": "user", "content": _TITLE_PROMPT.format(message=user_message[:300])}],
        )
        return resp.content[0].text.strip()

    return await asyncio.wait_for(asyncio.to_thread(_call), timeout=8.0)

_SYSTEM_PROMPT = (
    "You are the OutcomeX performance-marketing agent. Help the merchant negotiate "
    "the terms of a new performance contract.\n\n"
    "Negotiate these fields:\n"
    "- target_roas: ROAS threshold (e.g. 2.5 = 2.5× return on ad spend)\n"
    "- min_spend_usd: minimum ad spend commitment in USD\n"
    "- time_window_days: how long you have to hit the target (7–30 days is typical)\n"
    "- success_fee_usdc: fee paid to you in USDC only if the target is met\n"
    "- campaign_mode: 'new' (launching a new campaign) or 'optimize' (improving existing)\n"
    "- campaign_goal: description of the merchant's product and goal\n\n"
    "Once both parties have explicitly agreed on all terms, call finalize_contract. "
    "Do not finalize until the merchant has confirmed the terms."
)

_FINALIZE_TOOL = {
    "name": "finalize_contract",
    "description": (
        "Call this once both parties have agreed on all contract terms. "
        "Creates the contract record and sends the merchant to their workspace."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "target_roas": {"type": "number", "description": "Agreed ROAS threshold"},
            "min_spend_usd": {"type": "number", "description": "Minimum spend in USD"},
            "time_window_days": {"type": "integer", "description": "Performance window in days"},
            "success_fee_usdc": {"type": "number", "description": "Success fee in USDC"},
            "campaign_mode": {"type": "string", "enum": ["new", "optimize"]},
            "campaign_goal": {"type": "string", "description": "Campaign description"},
        },
        "required": [
            "target_roas", "min_spend_usd", "time_window_days",
            "success_fee_usdc", "campaign_mode",
        ],
    },
}


@router.post("/negotiation/stream")
@limiter.limit("20/minute")
async def stream_negotiation(
    request: Request,
    body: NegotiationRequest,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    clean_message = bleach.clean(body.message, tags=[], strip=True)

    # Resolve or create the contract row
    if body.contract_id:
        contract = require_contract_owner(db, body.contract_id, current_user)
        contract_id = str(contract.id)
        is_first_turn = False
    else:
        contract = repo.create_contract(
            db,
            merchant_id=current_user.id,
            target_metric="ROAS",
            status="Negotiating",
        )
        contract_id = str(contract.id)
        is_first_turn = True
        messages_repo.append(
            db, contract_id, "system", "system_event",
            content="Negotiation started",
            extra={"status": "Negotiating"},
        )

    # Save user message before streaming — never lost regardless of what follows
    messages_repo.append(db, contract_id, "merchant", "message", content=clean_message)

    log.info(
        "negotiation stream start user=%s contract=%s first=%s msg_len=%d",
        current_user.id, contract_id, is_first_turn, len(clean_message),
    )

    # Build history from DB — server-authoritative, never relies on frontend state.
    # Consecutive same-role messages are merged (Claude requires strict alternation).
    messages: list[dict] = []
    for m in messages_repo.get_all(db, contract_id):
        if m.role == "merchant":
            role = "user"
        elif m.role == "agent":
            role = "assistant"
        else:
            continue  # skip system events
        if messages and messages[-1]["role"] == role:
            messages[-1]["content"] += "\n" + m.content
        else:
            messages.append({"role": role, "content": m.content})

    async def generate():
        try:
            aborted = False
            accumulated = ""
            final_msg = None
            title_task = None

            if is_first_turn:
                yield f"event: session_created\ndata: {json.dumps({'contract_id': contract_id})}\n\n"
                title_task = asyncio.create_task(_generate_title(clean_message))

            _RETRYABLE = {429, 500, 503, 529}
            _MAX_RETRIES = 3
            for _attempt in range(_MAX_RETRIES + 1):
                try:
                    with _anthropic.messages.stream(
                        model="claude-sonnet-4-6",
                        max_tokens=1024,
                        system=_SYSTEM_PROMPT,
                        tools=[_FINALIZE_TOOL],
                        messages=messages,
                    ) as stream:
                        for text in stream.text_stream:
                            if await request.is_disconnected():
                                aborted = True
                                stream.close()
                                break
                            accumulated += text
                            yield f"event: text\ndata: {json.dumps({'delta': text})}\n\n"

                        if not aborted:
                            final_msg = stream.get_final_message()
                    break  # success — exit retry loop
                except APIStatusError as exc:
                    retryable = exc.status_code in _RETRYABLE or "overloaded" in str(exc).lower()
                    if retryable and not accumulated and _attempt < _MAX_RETRIES:
                        delay = (2 ** _attempt) * 0.5 + random.uniform(0, 0.5)
                        log.warning(
                            "API transient error (attempt %d/%d), retrying in %.1fs: %s",
                            _attempt + 1, _MAX_RETRIES + 1, delay, exc,
                        )
                        await asyncio.sleep(delay)
                        continue
                    raise

            # Flush whatever accumulated — covers both normal completion and Stop button
            if accumulated:
                sanitized = bleach.clean(accumulated, tags=[], strip=True)
                messages_repo.append(db, contract_id, "agent", "message", content=sanitized)

            # Emit workspace title (first turn only, even if stream was aborted)
            if title_task is not None:
                try:
                    title = await title_task
                except Exception:
                    title = clean_message[:60]
                repo.update_contract_title(db, contract_id, title)
                yield f"event: title_generated\ndata: {json.dumps({'title': title})}\n\n"

            if aborted or final_msg is None:
                return

            if final_msg.stop_reason == "tool_use":
                for block in final_msg.content:
                    if block.type != "tool_use" or block.name != "finalize_contract":
                        continue

                    inp = block.input

                    # Update the existing Negotiating row instead of creating a new contract
                    repo.finalize_negotiating_contract(
                        db,
                        contract_id=contract_id,
                        threshold=inp["target_roas"],
                        minimum_spend=inp["min_spend_usd"],
                        time_window_days=inp["time_window_days"],
                        success_fee_usdc=inp["success_fee_usdc"],
                        campaign_mode=inp["campaign_mode"],
                        campaign_goal=inp.get("campaign_goal", ""),
                    )

                    repo.log_audit_event(
                        db,
                        contract_id=contract_id,
                        component="llm_negotiation",
                        event_type="result",
                        payload={"action": "contract_finalized_via_negotiation", "terms": inp},
                    )

                    messages_repo.append(
                        db, contract_id, "system", "system_event",
                        content="Contract created",
                        extra={"status": "Created"},
                    )

                    log.info("contract finalized via negotiation contract=%s user=%s", contract_id, current_user.id)
                    yield f"event: contract_created\ndata: {json.dumps({'contract_id': contract_id})}\n\n"

                    # Stream Claude's closing summary after the tool call
                    assistant_content = [b.model_dump() for b in final_msg.content]
                    follow_messages = messages + [
                        {"role": "assistant", "content": assistant_content},
                        {
                            "role": "user",
                            "content": [{
                                "type": "tool_result",
                                "tool_use_id": block.id,
                                "content": json.dumps({"success": True, "contract_id": contract_id}),
                            }],
                        },
                    ]

                    with _anthropic.messages.stream(
                        model="claude-sonnet-4-6",
                        max_tokens=512,
                        system=_SYSTEM_PROMPT,
                        tools=[_FINALIZE_TOOL],
                        messages=follow_messages,
                    ) as follow_stream:
                        follow_text = ""
                        for text in follow_stream.text_stream:
                            if await request.is_disconnected():
                                follow_stream.close()
                                break
                            follow_text += text
                            yield f"event: text\ndata: {json.dumps({'delta': text})}\n\n"

                        if follow_text:
                            sanitized = bleach.clean(follow_text, tags=[], strip=True)
                            messages_repo.append(db, contract_id, "agent", "message", content=sanitized)

                    break

        except Exception as e:
            log.exception("negotiation stream error user=%s contract=%s", current_user.id, contract_id)
            yield f"event: error\ndata: {json.dumps({'message': str(e)})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
