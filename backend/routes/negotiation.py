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
    """Run underwriting + agent offer after negotiation finalizes (own DB session)."""
    db = SessionLocal()
    try:
        contract = repo.get_contract(db, contract_id)
        if contract is None or contract.status != "Created":
            log.warning("post_contract_bg: unexpected state contract=%s status=%s", contract_id, getattr(contract, "status", None))
            return

        # ── Underwriting ──────────────────────────────────────────────────────
        event_bus.publish(contract_id, "thinking_step_start", {
            "step_id": "post_underwrite",
            "label": "Running final ML underwriting assessment...",
        })
        log.info("post_contract_bg: starting underwriting contract=%s", contract_id)
        try:
            uw = contract_service.run_underwriting(db, contract)
            prob = uw.get("success_probability", 0)
            risk = uw.get("risk_level", "unknown")
            rec = uw.get("recommendation", "unknown")
            roas_range = uw.get("expected_roas_range", [])
            lines = [
                f"Success probability: {prob:.0%}",
                f"Risk level: {risk}",
                f"Recommendation: {rec}",
            ]
            if len(roas_range) >= 2:
                lines.append(f"Expected ROAS: {roas_range[0]:.2f}× – {roas_range[1]:.2f}×")
            event_bus.publish(contract_id, "thinking_step_detail", {"delta": "\n".join(lines)})
        except Exception:
            log.exception("post_contract_bg: underwriting failed contract=%s", contract_id)
            event_bus.publish(contract_id, "thinking_step_detail", {"delta": "Underwriting completed with defaults."})
        event_bus.publish(contract_id, "thinking_step_end", {"step_id": "post_underwrite"})

        # ── Agent offer ───────────────────────────────────────────────────────
        contract = repo.get_contract(db, contract_id)
        event_bus.publish(contract_id, "thinking_step_start", {
            "step_id": "agent_offer",
            "label": "Generating negotiated offer...",
        })
        log.info("post_contract_bg: generating agent offer contract=%s", contract_id)
        try:
            offer = contract_service.generate_agent_offer(db, contract)
            detail = offer.get("message", "Offer generated.")[:400]
            event_bus.publish(contract_id, "thinking_step_detail", {"delta": detail})
        except Exception:
            log.exception("post_contract_bg: agent offer failed contract=%s", contract_id)
            event_bus.publish(contract_id, "thinking_step_detail", {"delta": "Offer generated with default terms."})
        event_bus.publish(contract_id, "thinking_step_end", {"step_id": "agent_offer"})

        event_bus.publish(contract_id, "thinking_end", {})
        log.info("post_contract_bg: complete contract=%s", contract_id)
    except Exception:
        log.exception("post_contract_bg: failed contract=%s", contract_id)
        event_bus.publish(contract_id, "thinking_end", {})
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
    "Once both parties have explicitly agreed on all terms based on the evaluation, "
    "call finalize_contract. Do not finalize until the merchant has confirmed the terms."
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

async def _stream_turn(request, messages, *, max_tokens=1024):
    """Stream one Claude turn with retries. Yields (text_chunks..., final_message)."""
    _RETRYABLE = {429, 500, 503, 529}
    _MAX_RETRIES = 3
    accumulated = ""
    final_msg = None
    aborted = False

    for _attempt in range(_MAX_RETRIES + 1):
        accumulated = ""
        aborted = False
        try:
            with _anthropic.messages.stream(
                model="claude-sonnet-4-6",
                max_tokens=max_tokens,
                system=_SYSTEM_PROMPT,
                tools=_TOOLS,
                messages=messages,
            ) as stream:
                for text in stream.text_stream:
                    if await request.is_disconnected():
                        aborted = True
                        stream.close()
                        break
                    accumulated += text
                    yield ("text", text)
                if not aborted:
                    final_msg = stream.get_final_message()
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
            role = "user"
        elif m.role == "agent":
            role = "assistant"
        else:
            continue  # skip system events
        if current_messages and current_messages[-1]["role"] == role:
            current_messages[-1]["content"] += "\n" + m.content
        else:
            current_messages.append({"role": role, "content": m.content})

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

                async for item in _stream_turn(request, current_messages):
                    if item[0] == "text":
                        _, text = item
                        accumulated += text
                        yield f"event: text\ndata: {json.dumps({'delta': text})}\n\n"
                    else:
                        _, accumulated, aborted, final_msg = item

                # Persist whatever Claude said in this turn
                if accumulated:
                    sanitized = bleach.clean(accumulated, tags=[], strip=True)
                    messages_repo.append(db, contract_id, "agent", "message", content=sanitized)

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

                assistant_content = [b.model_dump() for b in final_msg.content]

                # ── evaluate_contract_terms ───────────────────────────────────
                if tool_block.name == "evaluate_contract_terms":
                    inp = tool_block.input
                    log.info(
                        "evaluate_contract_terms called contract=%s terms=%s",
                        contract_id, inp,
                    )

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

                    yield f"event: thinking_step_start\ndata: {json.dumps({'step_id': 'ml_underwrite', 'label': 'Running ML underwriting model...'})}\n\n"

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
                        yield f"event: thinking_step_detail\ndata: {json.dumps({'delta': chr(10).join(lines)})}\n\n"
                        tool_result = json.dumps(ml_result)
                        log.info(
                            "ML underwriting during negotiation contract=%s prob=%.2f rec=%s",
                            contract_id,
                            ml_result.get("success_probability", 0),
                            ml_result.get("recommendation"),
                        )
                    except Exception as exc:
                        log.warning("evaluate_contract_terms: underwriting failed contract=%s: %s", contract_id, exc)
                        yield f"event: thinking_step_detail\ndata: {json.dumps({'delta': f'ML model unavailable — using conservative estimate.'})}\n\n"
                        tool_result = json.dumps({"error": str(exc), "recommendation": "counteroffer"})

                    yield f"event: thinking_step_end\ndata: {json.dumps({'step_id': 'ml_underwrite'})}\n\n"
                    yield f"event: thinking_end\ndata: {json.dumps({})}\n\n"

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
                                "content": json.dumps({"success": True, "contract_id": contract_id}),
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
