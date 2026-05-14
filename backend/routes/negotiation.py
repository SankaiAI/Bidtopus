import json
import logging

import bleach
from anthropic import Anthropic
from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from limiter import limiter
import db.messages_repo as messages_repo
import db.repo as repo
from auth.clerk import get_current_user
from db.session import get_db
from models.schemas import NegotiationRequest
from config import settings

router = APIRouter(prefix="/api", tags=["negotiation"])
_anthropic = Anthropic(api_key=settings.anthropic_api_key)
log = logging.getLogger(__name__)

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
    log.info("negotiation stream start user=%s msg_len=%d history=%d", current_user.id, len(clean_message), len(body.history))

    messages = [
        {"role": item.role, "content": item.content}
        for item in body.history
    ]
    messages.append({"role": "user", "content": clean_message})

    async def generate():
        try:
            aborted = False
            final_msg = None

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
                    yield f"event: text\ndata: {json.dumps({'delta': text})}\n\n"

                if not aborted:
                    final_msg = stream.get_final_message()

            if aborted or final_msg is None:
                return

            if final_msg.stop_reason == "tool_use":
                for block in final_msg.content:
                    if block.type != "tool_use" or block.name != "finalize_contract":
                        continue

                    inp = block.input
                    contract = repo.create_contract(
                        db,
                        merchant_id=current_user.id,
                        threshold=inp["target_roas"],
                        minimum_spend=inp["min_spend_usd"],
                        time_window_days=inp["time_window_days"],
                        success_fee_usdc=inp["success_fee_usdc"],
                        campaign_mode=inp["campaign_mode"],
                        campaign_goal=inp.get("campaign_goal", ""),
                        status="Created",
                    )

                    repo.log_audit_event(
                        db,
                        contract_id=contract.id,
                        component="llm_negotiation",
                        event_type="result",
                        payload={"action": "contract_created_via_negotiation", "terms": inp},
                    )

                    messages_repo.append(
                        db, contract.id, "system", "system_event",
                        content="Contract created",
                        extra={"status": "Created"},
                    )

                    log.info("contract created via negotiation contract=%s user=%s", contract.id, current_user.id)
                    yield f"event: contract_created\ndata: {json.dumps({'contract_id': str(contract.id)})}\n\n"

                    # Stream Claude's closing summary after the tool call
                    assistant_content = [
                        b.model_dump() for b in final_msg.content
                    ]
                    follow_messages = messages + [
                        {"role": "assistant", "content": assistant_content},
                        {
                            "role": "user",
                            "content": [{
                                "type": "tool_result",
                                "tool_use_id": block.id,
                                "content": json.dumps({"success": True, "contract_id": str(contract.id)}),
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
                                aborted = True
                                follow_stream.close()
                                break
                            follow_text += text
                            yield f"event: text\ndata: {json.dumps({'delta': text})}\n\n"

                        if not aborted and follow_text:
                            sanitized = bleach.clean(follow_text, tags=[], strip=True)
                            messages_repo.append(
                                db, contract.id, "agent", "message", content=sanitized
                            )

                    break  # only one finalize_contract call expected

        except Exception as e:
            log.exception("negotiation stream error user=%s", current_user.id)
            yield f"event: error\ndata: {json.dumps({'message': str(e)})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
