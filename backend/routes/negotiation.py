import asyncio
import json
import logging
import random
import uuid

import bleach
from anthropic import Anthropic, APIStatusError
from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from limiter import limiter
import agent_client
import event_bus
import db.messages_repo as messages_repo
import db.repo as repo
from db.models import PerformanceContract
from auth.clerk import get_current_user
from db.session import get_db, SessionLocal
from models.schemas import NegotiationRequest
from services.contract_service import require_contract_owner
from services import contract_service
from config import settings

router = APIRouter(prefix="/api", tags=["negotiation"])
_anthropic = Anthropic(api_key=settings.anthropic_api_key)
log = logging.getLogger(__name__)


# ── Background task ───────────────────────────────────────────────────────────

def _post_contract_background(contract_id: str) -> None:
    """Run underwriting + agent offer silently after negotiation finalizes.

    Background work must NOT publish to the event bus — internal processing
    must never leak into the user-facing workspace stream.  Results are stored
    in the DB and surfaced as a single summary agent message when complete.
    """
    db = SessionLocal()
    try:
        contract = repo.get_contract(db, contract_id)
        if contract is None or contract.status != "Created":
            log.warning("post_contract_bg: unexpected state contract=%s status=%s",
                        contract_id, getattr(contract, "status", None))
            return

        # ── Underwriting (silent) ─────────────────────────────────────────────
        log.info("post_contract_bg: starting underwriting contract=%s", contract_id)
        prob = risk = rec = None
        roas_range: list = []
        try:
            uw = contract_service.run_underwriting(db, contract)
            prob = uw.get("success_probability")
            risk = uw.get("risk_level")
            rec  = uw.get("recommendation")
            roas_range = uw.get("expected_roas_range", [])
            log.info("post_contract_bg: underwriting done contract=%s prob=%.0f%% risk=%s rec=%s",
                     contract_id, (prob or 0) * 100, risk, rec)
        except Exception:
            log.exception("post_contract_bg: underwriting failed contract=%s", contract_id)

        # ── Agent offer (silent) ──────────────────────────────────────────────
        contract = repo.get_contract(db, contract_id)
        log.info("post_contract_bg: generating agent offer contract=%s", contract_id)
        try:
            contract_service.generate_agent_offer(db, contract, on_reasoning=None)
        except Exception:
            log.exception("post_contract_bg: agent offer failed contract=%s", contract_id)

        # ── Single user-facing summary message ────────────────────────────────
        lines = ["**Your contract is confirmed and ready to fund!**\n"]
        if prob is not None:
            lines.append(f"Our ML model shows **{prob:.0%} success probability** "
                         f"with **{risk or 'unknown'} risk**.")
        if len(roas_range) >= 2:
            lines.append(f"Expected ROAS: **{roas_range[0]:.2f}×–{roas_range[1]:.2f}×** "
                         f"(your target: {getattr(contract, 'threshold', '?')}×).")
        lines.append("\nFund the escrow to launch your campaign — "
                     "I'll start optimizing immediately once it's live.")
        summary = "\n".join(lines)

        messages_repo.append(db, contract_id, "agent", "message", content=summary)
        event_bus.publish(contract_id, "message", {
            "role": "agent",
            "type": "message",
            "content": summary,
        })
        log.info("post_contract_bg: complete contract=%s", contract_id)
    except Exception:
        log.exception("post_contract_bg: failed contract=%s", contract_id)
    finally:
        db.close()


# ── Title generation ──────────────────────────────────────────────────────────

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


# ── Prompts & tools ───────────────────────────────────────────────────────────

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
    "IMPORTANT — Before accepting or proposing final terms, you MUST call "
    "evaluate_contract_terms with the proposed numbers. The tool runs an ML model "
    "that returns success_probability, risk_level, and a recommendation "
    "(accept / counteroffer / reject). Use that result to ground your response:\n"
    "- recommendation=accept (≥65% probability): you may accept the terms\n"
    "- recommendation=counteroffer (35–64%): propose revised terms to reduce risk\n"
    "- recommendation=reject (<35%): decline and explain why the target is not achievable\n\n"
    "Call evaluate_contract_terms whenever the merchant proposes specific numeric terms, "
    "or whenever you are about to make an accept/counteroffer/reject decision. "
    "Once the ML model returns recommendation=accept, present the terms clearly and ask the merchant "
    "to confirm with an explicit YES. Do NOT call finalize_contract until the merchant responds with "
    "an unambiguous confirmation such as 'yes', 'confirm', 'agreed', 'lock it in', or similar. "
    "A question, silence, or vague reply is NOT confirmation — keep asking until you get a clear yes."
)

_EVALUATE_TOOL = {
    "name": "evaluate_contract_terms",
    "description": (
        "Run the ML underwriting model against proposed contract terms. "
        "Call this whenever the merchant proposes specific numeric terms, or before "
        "making any accept/counteroffer/reject decision. Returns success probability, "
        "risk level, expected ROAS range, recommendation, and a suggested fee."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "target_roas": {"type": "number", "description": "Proposed ROAS threshold"},
            "min_spend_usd": {"type": "number", "description": "Proposed minimum spend in USD"},
            "time_window_days": {"type": "integer", "description": "Proposed performance window in days"},
            "success_fee_usdc": {"type": "number", "description": "Proposed success fee in USDC"},
            "campaign_mode": {"type": "string", "enum": ["new", "optimize"]},
        },
        "required": ["target_roas", "min_spend_usd", "time_window_days", "success_fee_usdc", "campaign_mode"],
    },
}

_FINALIZE_TOOL = {
    "name": "finalize_contract",
    "description": (
        "Call this once both parties have agreed on all contract terms AND you have "
        "evaluated them with evaluate_contract_terms and received a recommendation of "
        "accept. Creates the contract record and sends the merchant to their workspace."
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

_TOOLS = [_EVALUATE_TOOL, _FINALIZE_TOOL]


# ── Streaming helpers ─────────────────────────────────────────────────────────

def _serialize_block(b) -> dict:
    """Serialize a content block to only the fields the API accepts in multi-turn messages.
    Newer SDK versions add extra fields (parsed_output, citations, caller) that cause 400s."""
    if b.type == "thinking":
        return {"type": "thinking", "thinking": b.thinking, "signature": b.signature}
    if b.type == "text":
        return {"type": "text", "text": b.text}
    if b.type == "tool_use":
        return {"type": "tool_use", "id": b.id, "name": b.name, "input": b.input}
    return b.model_dump(exclude_none=True)


_THINKING_BUDGET = 15000


async def _stream_turn(request, messages, *, max_tokens=1024):
    """Stream one Claude turn with retries. Yields thinking chunks, text chunks, final_message."""
    _RETRYABLE = {429, 500, 503, 529}
    _MAX_RETRIES = 3
    accumulated = ""
    final_msg = None
    aborted = False

    for _attempt in range(_MAX_RETRIES + 1):
        accumulated = ""
        aborted = False
        try:
            log.debug("LLM input [negotiation] attempt=%d messages=%d:\n%s",
                      _attempt, len(messages), json.dumps(messages, indent=2, default=str))
            with _anthropic.messages.stream(
                model="claude-sonnet-4-6",
                max_tokens=max_tokens + _THINKING_BUDGET,
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
            log.debug("LLM output [negotiation] stop_reason=%s text_len=%d repr=%s",
                      getattr(final_msg, "stop_reason", None), len(accumulated), repr(accumulated))
            break
        except APIStatusError as exc:
            retryable = exc.status_code in _RETRYABLE or "overloaded" in str(exc).lower()
            if retryable and not accumulated and _attempt < _MAX_RETRIES:
                delay = (2 ** _attempt) * 0.5 + random.uniform(0, 0.5)
                log.warning("API transient error (attempt %d/%d), retrying in %.1fs: %s",
                            _attempt + 1, _MAX_RETRIES + 1, delay, exc)
                await asyncio.sleep(delay)
                continue
            raise

    yield ("done", accumulated, aborted, final_msg)


# ── Route ─────────────────────────────────────────────────────────────────────

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

    # On the first turn, fetch historical Meta Ads context and store it on the contract
    # so the ML underwriting model has real account data for the entire negotiation.
    if is_first_turn and current_user.meta_ads_account_id:
        try:
            account_ctx = agent_client.get_account_context(current_user.meta_ads_account_id)
            db.query(PerformanceContract).filter_by(id=contract_id).update(
                {"account_context": account_ctx}
            )
            db.commit()
            log.info(
                "account_context fetched contract=%s account=%s roas_7d=%s",
                contract_id, current_user.meta_ads_account_id,
                account_ctx.get("historical_roas_7d"),
            )
        except Exception:
            log.warning("Failed to fetch account_context contract=%s — proceeding with defaults", contract_id)

    # Save user message before streaming — never lost regardless of what follows
    messages_repo.append(db, contract_id, "merchant", "message", content=clean_message)

    log.info(
        "negotiation stream start user=%s contract=%s first=%s msg_len=%d",
        current_user.id, contract_id, is_first_turn, len(clean_message),
    )

    # Build history from DB — server-authoritative, never relies on frontend state.
    # Consecutive same-role messages are merged (Claude requires strict alternation).
    current_messages: list[dict] = []
    for m in messages_repo.get_all(db, contract_id):
        if m.role == "merchant":
            if current_messages and current_messages[-1]["role"] == "user":
                current_messages[-1]["content"] += "\n" + m.content
            else:
                current_messages.append({"role": "user", "content": m.content})
        elif m.role == "agent" and m.type == "message":
            if current_messages and current_messages[-1]["role"] == "assistant":
                current_messages[-1]["content"] += "\n" + m.content
            else:
                current_messages.append({"role": "assistant", "content": m.content})
        elif m.role == "agent" and m.type == "tool_call":
            # Replay assistant turn with tool_use block so Claude sees its previous tool calls
            current_messages.append({"role": "assistant", "content": (m.extra or {}).get("assistant_content", [])})
        elif m.role == "system" and m.type == "tool_result":
            # Replay tool result so Claude knows what the tool returned
            extra = m.extra or {}
            current_messages.append({"role": "user", "content": [{
                "type": "tool_result",
                "tool_use_id": extra.get("tool_use_id", ""),
                "content": extra.get("content", ""),
            }]})
        else:
            continue  # skip thinking_step rows, other system events

    async def generate():
        nonlocal current_messages
        try:
            title_task = None
            title_emitted = False

            if is_first_turn:
                yield f"event: session_created\ndata: {json.dumps({'contract_id': contract_id})}\n\n"
                title_task = asyncio.create_task(_generate_title(clean_message))

            # Tool-call loop — Claude may call evaluate_contract_terms multiple times
            # before finalizing. Each iteration is one complete Claude turn.
            while True:
                accumulated = ""
                aborted = False
                final_msg = None
                thinking_parts: list[str] = []
                thinking_seq_id = str(uuid.uuid4())
                thinking_started = False
                text_started = False  # tracks whether agent message bubble exists yet

                async for item in _stream_turn(request, current_messages):
                    if item[0] == "thinking":
                        _, thinking_text = item
                        thinking_parts.append(thinking_text)
                        # Don't emit yet — wait until after the first text delta so the
                        # frontend's agent message bubble exists before the thinking block
                        # tries to attach to it.
                    elif item[0] == "text":
                        _, text = item
                        accumulated += text
                        if not text_started:
                            text_started = True
                            # Emit the first text delta first — this creates the agent
                            # message bubble in the frontend. Only then flush buffered
                            # thinking so it attaches to the existing bubble.
                            yield f"event: text\ndata: {json.dumps({'delta': text})}\n\n"
                            if thinking_parts:
                                thinking_started = True
                                yield f"event: thinking_step_start\ndata: {json.dumps({'step_id': 'negotiation_think', 'label': 'Agent reasoning...', 'thinking_sequence_id': thinking_seq_id})}\n\n"
                                for chunk in thinking_parts:
                                    yield f"event: thinking_step_detail\ndata: {json.dumps({'delta': chunk})}\n\n"
                        else:
                            yield f"event: text\ndata: {json.dumps({'delta': text})}\n\n"
                    else:
                        _, accumulated, aborted, final_msg = item

                # Close thinking block SSE events for this turn
                if thinking_started:
                    yield f"event: thinking_step_end\ndata: {json.dumps({'step_id': 'negotiation_think', 'thinking_sequence_id': thinking_seq_id})}\n\n"
                    yield f"event: thinking_end\ndata: {json.dumps({'thinking_sequence_id': thinking_seq_id})}\n\n"

                # Persist text first so restore shows: text → Agent reasoning → ML evaluation
                if accumulated:
                    sanitized = bleach.clean(accumulated, tags=[], strip=True)
                    messages_repo.append(db, contract_id, "agent", "message", content=sanitized)

                # Persist thinking after text
                if thinking_started:
                    messages_repo.append(
                        db, contract_id, "agent", "thinking_step",
                        content="".join(thinking_parts),
                        extra={"step_id": "negotiation_think", "label": "Agent reasoning...", "thinking_sequence_id": thinking_seq_id, "is_complete": True},
                    )
                    log.debug("agent thinking [negotiation] contract=%s:\n%s", contract_id, "".join(thinking_parts))

                # Emit title after the first turn (first turn only, even if aborted)
                if not title_emitted and title_task is not None:
                    try:
                        title = await title_task
                    except Exception:
                        title = clean_message[:60]
                    repo.update_contract_title(db, contract_id, title)
                    yield f"event: title_generated\ndata: {json.dumps({'title': title})}\n\n"
                    title_emitted = True

                if aborted or final_msg is None:
                    return

                # Natural end of turn — Claude finished speaking, no tool call
                if final_msg.stop_reason != "tool_use":
                    return

                # ── Tool dispatch ─────────────────────────────────────────────
                tool_block = next(
                    (b for b in final_msg.content if b.type == "tool_use"), None
                )
                if tool_block is None:
                    return

                assistant_content = [_serialize_block(b) for b in final_msg.content]

                # ── evaluate_contract_terms ───────────────────────────────────
                if tool_block.name == "evaluate_contract_terms":
                    inp = tool_block.input
                    log.info("evaluate_contract_terms called contract=%s terms=%s", contract_id, inp)
                    log.debug("tool input [evaluate_contract_terms]:\n%s", json.dumps(inp, indent=2))

                    # Write proposed terms to the negotiating contract so the
                    # agent's ML model can read them via the standard DB path.
                    db.query(PerformanceContract).filter_by(id=contract_id).update({
                        "threshold": inp["target_roas"],
                        "minimum_spend": inp["min_spend_usd"],
                        "time_window_days": inp["time_window_days"],
                        "success_fee_usdc": inp["success_fee_usdc"],
                        "campaign_mode": inp["campaign_mode"],
                    })
                    db.commit()

                    uw_label = "Running ML underwriting model..."
                    step_sequence_id = str(uuid.uuid4())
                    yield f"event: thinking_step_start\ndata: {json.dumps({'step_id': 'ml_underwrite', 'label': uw_label, 'thinking_sequence_id': step_sequence_id})}\n\n"

                    uw_detail_parts: list[str] = []
                    try:
                        ml_result = await asyncio.to_thread(agent_client.run_underwriting, contract_id)
                        prob = ml_result.get("success_probability", 0)
                        risk = ml_result.get("risk_level", "unknown")
                        rec = ml_result.get("recommendation", "unknown")
                        roas_range = ml_result.get("expected_roas_range", [])
                        fee = ml_result.get("recommended_fee_usdc")
                        lines = [
                            f"Success probability: {prob:.0%}",
                            f"Risk level: {risk}",
                            f"Recommendation: {rec}",
                        ]
                        if len(roas_range) >= 2:
                            lines.append(f"Expected ROAS: {roas_range[0]:.2f}× – {roas_range[1]:.2f}×")
                        if fee is not None:
                            lines.append(f"Recommended fee: {fee} USDC")
                        detail = chr(10).join(lines)
                        uw_detail_parts.append(detail)
                        yield f"event: thinking_step_detail\ndata: {json.dumps({'delta': detail})}\n\n"
                        tool_result = json.dumps(ml_result)
                        log.info("ML underwriting during negotiation contract=%s prob=%.2f rec=%s",
                                 contract_id, ml_result.get("success_probability", 0), ml_result.get("recommendation"))
                        log.debug("tool result [evaluate_contract_terms]:\n%s", json.dumps(ml_result, indent=2))
                    except Exception as exc:
                        log.warning("evaluate_contract_terms: underwriting failed contract=%s: %s", contract_id, exc)
                        fallback = "ML model unavailable — using conservative estimate."
                        uw_detail_parts.append(fallback)
                        yield f"event: thinking_step_detail\ndata: {json.dumps({'delta': fallback})}\n\n"
                        tool_result = json.dumps({"error": str(exc), "recommendation": "counteroffer"})

                    messages_repo.append(
                        db, contract_id, "agent", "thinking_step",
                        content="\n".join(uw_detail_parts),
                        extra={"step_id": "ml_underwrite", "label": uw_label, "thinking_sequence_id": step_sequence_id, "is_complete": True},
                    )
                    yield f"event: thinking_step_end\ndata: {json.dumps({'step_id': 'ml_underwrite', 'thinking_sequence_id': step_sequence_id})}\n\n"
                    yield f"event: thinking_end\ndata: {json.dumps({'thinking_sequence_id': step_sequence_id})}\n\n"

                    # Signal frontend to show Confirm Terms button only when ML says accept
                    ml_rec = json.loads(tool_result).get("recommendation", "")
                    if ml_rec == "accept":
                        yield f"event: terms_ready\ndata: {json.dumps({'contract_id': contract_id})}\n\n"

                    # Persist tool exchange so history reconstruction replays it on future turns
                    messages_repo.append(
                        db, contract_id, "agent", "tool_call",
                        content="",
                        extra={"assistant_content": assistant_content, "tool_use_id": tool_block.id},
                    )
                    messages_repo.append(
                        db, contract_id, "system", "tool_result",
                        content="",
                        extra={"tool_use_id": tool_block.id, "content": tool_result},
                    )

                    # Append assistant turn + tool result and continue the loop
                    current_messages = current_messages + [
                        {"role": "assistant", "content": assistant_content},
                        {
                            "role": "user",
                            "content": [{
                                "type": "tool_result",
                                "tool_use_id": tool_block.id,
                                "content": tool_result,
                            }],
                        },
                    ]
                    continue  # next iteration: Claude responds with accept/counter/reject

                # ── finalize_contract ─────────────────────────────────────────
                if tool_block.name == "finalize_contract":
                    inp = tool_block.input
                    log.debug("tool input [finalize_contract]:\n%s", json.dumps(inp, indent=2))

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
                    finalize_tool_result = json.dumps({"success": True, "contract_id": contract_id})
                    messages_repo.append(
                        db, contract_id, "agent", "tool_call",
                        content="",
                        extra={"assistant_content": assistant_content, "tool_use_id": tool_block.id},
                    )
                    messages_repo.append(
                        db, contract_id, "system", "tool_result",
                        content="",
                        extra={"tool_use_id": tool_block.id, "content": finalize_tool_result},
                    )

                    log.info("contract finalized via negotiation contract=%s user=%s", contract_id, current_user.id)
                    yield f"event: contract_created\ndata: {json.dumps({'contract_id': contract_id})}\n\n"

                    # Auto-advance: underwriting + agent offer run in background
                    asyncio.create_task(asyncio.to_thread(_post_contract_background, contract_id))

                    # Stream Claude's closing summary
                    follow_messages = current_messages + [
                        {"role": "assistant", "content": assistant_content},
                        {
                            "role": "user",
                            "content": [{
                                "type": "tool_result",
                                "tool_use_id": tool_block.id,
                                "content": finalize_tool_result,
                            }],
                        },
                    ]

                    with _anthropic.messages.stream(
                        model="claude-sonnet-4-6",
                        max_tokens=512,
                        system=_SYSTEM_PROMPT,
                        tools=_TOOLS,
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
                            log.debug("LLM output [follow] repr: %s", repr(follow_text))
                            sanitized = bleach.clean(follow_text, tags=[], strip=True)
                            messages_repo.append(db, contract_id, "agent", "message", content=sanitized)

                    return  # conversation complete

                # Unknown tool — log and stop
                log.warning("Unknown tool called during negotiation: %s", tool_block.name)
                return

        except Exception as e:
            log.exception("negotiation stream error user=%s contract=%s", current_user.id, contract_id)
            yield f"event: error\ndata: {json.dumps({'message': str(e)})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
