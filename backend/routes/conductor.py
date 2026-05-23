"""
Unified autonomous conductor endpoint.
POST /api/contracts/{contract_id}/conductor/stream

Claude decides which capability to invoke based on contract state and the
merchant's message. Every reasoning step and tool result is streamed live
as SSE thinking_step events — merchants see what the agent is doing in real
time, not after it finishes.
"""

import asyncio
import json
import logging
import random
import uuid

import bleach
from anthropic import Anthropic, APIStatusError
from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

import agent_client
import db.messages_repo as messages_repo
import db.repo as repo
from auth.clerk import get_current_user
from db.session import get_db
from limiter import limiter
from services.contract_service import require_contract_owner
from config import settings

router = APIRouter(prefix="/api", tags=["conductor"])
_anthropic = Anthropic(api_key=settings.anthropic_api_key)
log = logging.getLogger(__name__)


# ── Request schema ────────────────────────────────────────────────────────────

class ConductorRequest(BaseModel):
    message: str


# ── System prompt ─────────────────────────────────────────────────────────────

_SYSTEM_PROMPT = """You are the Bidtopus autonomous performance-marketing agent.
You manage the full lifecycle of a performance contract between an AI agent (you) and a merchant.

Your job: read the contract state, understand what the merchant needs, and take the right action.

Contract lifecycle states and what to do at each:
- Created:        Run ML underwriting to evaluate risk → call run_ml_underwriting
- Underwriting:   Generate the agent offer (accept/counteroffer/reject) → call generate_agent_offer
- Offered:        Offer was sent. Explain the offer terms. Wait for merchant to accept and fund.
- FundedPending:  Escrow funding is processing. Reassure the merchant.
- Funded:         Escrow confirmed. Generate the Meta Ads strategy plan → call generate_ad_strategy
- Active:         Campaign is live. Check performance → call check_performance
- Settled:        Contract resolved. Show the outcome and settlement tx hash.

Rules:
1. Always call check_contract_state first to understand the current state before acting.
2. Match your action to the contract's current state — don't skip steps.
3. For general questions, answer directly from the contract state without extra agent calls.
4. Never call execute_ad_actions unless the merchant has explicitly approved the strategy cards.
5. The resolution engine is deterministic — never guess the outcome; always call resolve_contract.
6. Stream your reasoning live — merchants see your thinking in real time as you work.
"""


# ── Tool definitions ──────────────────────────────────────────────────────────

_TOOLS = [
    {
        "name": "check_contract_state",
        "description": (
            "Read the current contract state, agreed terms, recent messages, and performance "
            "data from the database. Call this first on every turn."
        ),
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "run_ml_underwriting",
        "description": (
            "Run the ML underwriting model against the contract terms. Returns success_probability, "
            "risk_level, expected_roas_range, recommendation (accept/counteroffer/reject), and "
            "recommended_fee_usdc. Call when contract status is Created."
        ),
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "generate_agent_offer",
        "description": (
            "Generate the LLM negotiation offer based on underwriting results. Returns "
            "offer_type (accept/counteroffer/reject), a plain-language message, and any revised "
            "terms. Call when contract status is Underwriting."
        ),
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "generate_ad_strategy",
        "description": (
            "Generate a Meta Ads campaign plan. Reads the merchant's existing campaigns, pixel "
            "events, and audience performance via MCP, then writes 4 approval_request cards "
            "(campaign, audience, budget, creative). Call when contract status is Funded."
        ),
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "execute_ad_actions",
        "description": (
            "Execute all merchant-approved Meta Ads actions via MCP: create campaign, ad sets, "
            "creatives, and ads. Stores campaign_id and ad_set_ids as execution receipts. "
            "Only call after the merchant has approved the strategy cards."
        ),
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "check_performance",
        "description": (
            "Get the current campaign performance snapshot: spend, revenue, ROAS, CTR, and the "
            "ML live forecast (predicted_final_roas, success_probability, on_track/at_risk status, "
            "day N of M). Call when contract status is Active."
        ),
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "resolve_contract",
        "description": (
            "Run the deterministic resolution engine and settle escrow on-chain. Evaluates "
            "final_spend >= minimum_spend AND final_roas >= target_roas. Returns outcome "
            "(success/failure), final metrics, and the Arc settlement tx hash. Call when the "
            "evaluation window has closed."
        ),
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
]

_TOOL_LABELS = {
    "check_contract_state":   "Reading contract state...",
    "run_ml_underwriting":    "Running ML underwriting model...",
    "generate_agent_offer":   "Generating agent offer...",
    "generate_ad_strategy":   "Reading Meta Ads account & building strategy...",
    "execute_ad_actions":     "Executing Meta Ads campaign actions...",
    "check_performance":      "Checking campaign performance...",
    "resolve_contract":       "Resolving contract & settling escrow...",
}

_THINKING_BUDGET = 8000


# ── Tool dispatcher ───────────────────────────────────────────────────────────

def _dispatch_tool(
    tool_name: str,
    contract_id: str,
    db: Session,
    current_user,
) -> dict:
    if tool_name == "check_contract_state":
        contract = repo.get_contract(db, contract_id)
        if contract is None:
            return {"error": "contract not found"}
        recent_messages = [
            {
                "role": m.role,
                "type": m.type,
                "content": m.content,
                "created_at": str(m.created_at),
            }
            for m in messages_repo.get_all(db, contract_id)
            if m.type in ("message", "daily_update", "system_event")
        ][-20:]
        return {
            "status": contract.status,
            "threshold": contract.threshold,
            "minimum_spend": contract.minimum_spend,
            "time_window_days": contract.time_window_days,
            "success_fee_usdc": contract.success_fee_usdc,
            "campaign_mode": contract.campaign_mode,
            "campaign_goal": contract.campaign_goal,
            "created_at": str(contract.created_at),
            "recent_messages": recent_messages,
        }

    elif tool_name == "run_ml_underwriting":
        return agent_client.run_underwriting(contract_id)

    elif tool_name == "generate_agent_offer":
        return agent_client.generate_agent_offer(contract_id)

    elif tool_name == "generate_ad_strategy":
        contract = repo.get_contract(db, contract_id)
        meta_account = repo.get_meta_account(db, str(contract.meta_ads_account_id)) if contract and contract.meta_ads_account_id else None
        return agent_client.generate_plan(
            contract_id,
            user_id=str(current_user.id),
            meta_ads_account_id=current_user.meta_ads_account_id,
            access_token=meta_account.access_token if meta_account else None,
        )

    elif tool_name == "execute_ad_actions":
        contract = repo.get_contract(db, contract_id)
        meta_account = repo.get_meta_account(db, str(contract.meta_ads_account_id)) if contract and contract.meta_ads_account_id else None
        return agent_client.execute_ads_actions(
            contract_id,
            access_token=meta_account.access_token if meta_account else None,
        )

    elif tool_name == "check_performance":
        # Placeholder until agent exposes GET /agent/performance
        contract = repo.get_contract(db, contract_id)
        if contract is None:
            return {"error": "contract not found"}
        return {
            "note": "Live performance endpoint coming soon.",
            "status": getattr(contract, "status", None),
            "time_window_days": getattr(contract, "time_window_days", None),
        }

    elif tool_name == "resolve_contract":
        return agent_client.resolve_contract(contract_id)

    return {"error": f"unknown tool: {tool_name}"}


# ── Streaming helper ──────────────────────────────────────────────────────────

def _serialize_block(b) -> dict:
    if b.type == "thinking":
        return {"type": "thinking", "thinking": b.thinking, "signature": b.signature}
    if b.type == "text":
        return {"type": "text", "text": b.text}
    if b.type == "tool_use":
        return {"type": "tool_use", "id": b.id, "name": b.name, "input": b.input}
    return b.model_dump(exclude_none=True)


async def _stream_turn(request: Request, messages: list[dict]):
    """Stream one Claude turn. Yields ('thinking', text), ('text', text), or ('done', ...) tuples."""
    _RETRYABLE = {429, 500, 503, 529}
    _MAX_RETRIES = 3
    accumulated = ""
    final_msg = None
    aborted = False

    for attempt in range(_MAX_RETRIES + 1):
        accumulated = ""
        aborted = False
        try:
            with _anthropic.messages.stream(
                model=settings.claude_model,
                max_tokens=4096 + _THINKING_BUDGET,
                thinking={"type": "enabled", "budget_tokens": _THINKING_BUDGET},
                system=_SYSTEM_PROMPT,
                tools=_TOOLS,
                messages=messages,
            ) as stream:
                for event in stream:
                    if await request.is_disconnected():
                        aborted = True
                        stream.close()
                        break
                    if event.type == "content_block_delta":
                        if event.delta.type == "thinking_delta":
                            yield ("thinking", event.delta.thinking)
                        elif event.delta.type == "text_delta":
                            accumulated += event.delta.text
                            yield ("text", event.delta.text)
                if not aborted:
                    final_msg = stream.get_final_message()
            break
        except APIStatusError as exc:
            retryable = exc.status_code in _RETRYABLE or "overloaded" in str(exc).lower()
            if retryable and not accumulated and attempt < _MAX_RETRIES:
                delay = (2 ** attempt) * 0.5 + random.uniform(0, 0.5)
                log.warning("conductor: API transient error (attempt %d/%d), retry in %.1fs: %s",
                            attempt + 1, _MAX_RETRIES + 1, delay, exc)
                await asyncio.sleep(delay)
                continue
            raise

    yield ("done", accumulated, aborted, final_msg)


# ── Route ─────────────────────────────────────────────────────────────────────

@router.post("/contracts/{contract_id}/conductor/stream")
@limiter.limit("30/minute")
async def conductor_stream(
    contract_id: str,
    request: Request,
    body: ConductorRequest,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_contract_owner(db, contract_id, current_user)
    clean_message = bleach.clean(body.message, tags=[], strip=True)

    log.info("conductor stream start user=%s contract=%s msg_len=%d",
             current_user.id, contract_id, len(clean_message))

    messages_repo.append(db, contract_id, "merchant", "message", content=clean_message)

    async def generate():
        # Conductor starts with just the merchant message; tool results are
        # appended to this list as the loop executes.
        turn_messages = [{"role": "user", "content": clean_message}]

        try:
            while True:
                thinking_parts: list[str] = []
                thinking_seq_id = str(uuid.uuid4())
                thinking_started = False
                thinking_closed = False
                accumulated = ""
                aborted = False
                final_msg = None

                async for item in _stream_turn(request, turn_messages):
                    if item[0] == "thinking":
                        _, thinking_text = item
                        thinking_parts.append(thinking_text)
                        if not thinking_started:
                            thinking_started = True
                            yield (
                                f"event: thinking_step_start\n"
                                f"data: {json.dumps({'step_id': 'conductor_think', 'label': 'Agent reasoning...', 'thinking_sequence_id': thinking_seq_id})}\n\n"
                            )
                        yield f"event: thinking_step_detail\ndata: {json.dumps({'delta': thinking_text})}\n\n"

                    elif item[0] == "text":
                        _, text = item
                        accumulated += text
                        # Close thinking block before the first text word reaches the UI
                        if not thinking_closed and thinking_started:
                            thinking_closed = True
                            yield (
                                f"event: thinking_step_end\n"
                                f"data: {json.dumps({'step_id': 'conductor_think', 'thinking_sequence_id': thinking_seq_id})}\n\n"
                            )
                            yield f"event: thinking_end\ndata: {json.dumps({'thinking_sequence_id': thinking_seq_id})}\n\n"
                        yield f"event: text\ndata: {json.dumps({'delta': text})}\n\n"

                    else:
                        _, accumulated, aborted, final_msg = item

                # Close thinking if the turn ended without producing any text (tool-only turn)
                if thinking_started and not thinking_closed:
                    yield (
                        f"event: thinking_step_end\n"
                        f"data: {json.dumps({'step_id': 'conductor_think', 'thinking_sequence_id': thinking_seq_id})}\n\n"
                    )
                    yield f"event: thinking_end\ndata: {json.dumps({'thinking_sequence_id': thinking_seq_id})}\n\n"

                if aborted or final_msg is None:
                    break

                # Persist any text the agent produced this turn
                if accumulated:
                    sanitized = bleach.clean(accumulated, tags=[], strip=True)
                    messages_repo.append(db, contract_id, "agent", "message", content=sanitized)

                # No tool call — Claude is done
                if final_msg.stop_reason != "tool_use":
                    break

                # ── Tool dispatch ────────────────────────────────────────────
                tool_block = next(
                    (b for b in final_msg.content if b.type == "tool_use"), None
                )
                if tool_block is None:
                    break

                tool_name = tool_block.name
                label = _TOOL_LABELS.get(tool_name, f"Calling {tool_name}...")
                tool_step_id = f"tool_{tool_name}"
                tool_seq_id = str(uuid.uuid4())

                # Open a new thinking step for the tool call so the merchant can
                # watch the result appear in real time
                yield (
                    f"event: thinking_step_start\n"
                    f"data: {json.dumps({'step_id': tool_step_id, 'label': label, 'thinking_sequence_id': tool_seq_id})}\n\n"
                )

                tool_result: dict = {}
                tool_error: str | None = None
                try:
                    tool_result = await asyncio.to_thread(
                        _dispatch_tool, tool_name, contract_id, db, current_user
                    )
                    # Stream the first 1 200 chars of the result so the merchant
                    # can see what the tool returned without being overwhelmed
                    summary = json.dumps(tool_result, indent=2, default=str)[:1200]
                    yield f"event: thinking_step_detail\ndata: {json.dumps({'delta': summary})}\n\n"
                    log.debug("conductor tool result tool=%s contract=%s:\n%s",
                              tool_name, contract_id, summary)
                except Exception as exc:
                    tool_error = str(exc)
                    log.exception("conductor tool error tool=%s contract=%s", tool_name, contract_id)
                    yield f"event: thinking_step_detail\ndata: {json.dumps({'delta': f'Error: {tool_error}'})}\n\n"

                yield (
                    f"event: thinking_step_end\n"
                    f"data: {json.dumps({'step_id': tool_step_id, 'thinking_sequence_id': tool_seq_id})}\n\n"
                )
                yield f"event: thinking_end\ndata: {json.dumps({'thinking_sequence_id': tool_seq_id})}\n\n"

                # If this turn produced text before the tool call, close the current
                # agent bubble so the next turn's response opens a fresh one.
                if accumulated:
                    yield f"event: message_break\ndata: {{}}\n\n"

                # Build the next turn: append Claude's assistant turn + the tool result
                assistant_content = [_serialize_block(b) for b in final_msg.content]
                tool_result_content = tool_error if tool_error else json.dumps(tool_result, default=str)

                turn_messages = turn_messages + [
                    {"role": "assistant", "content": assistant_content},
                    {
                        "role": "user",
                        "content": [{
                            "type": "tool_result",
                            "tool_use_id": tool_block.id,
                            "content": tool_result_content,
                        }],
                    },
                ]

        except Exception as exc:
            log.exception("conductor stream error contract=%s", contract_id)
            corr_id = str(uuid.uuid4())[:8]
            yield f"event: error\ndata: {json.dumps({'message': str(exc), 'correlation_id': corr_id})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
