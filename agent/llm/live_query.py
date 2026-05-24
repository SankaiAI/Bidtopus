"""Live data query agent — answers merchant questions using real-time Meta Ads data.

Fetches live campaign/ad set/insight/creative data via the Meta Ads adapter,
then streams extended thinking + a final answer back to the caller.

SSE event sequence:
  thinking_step_start  {"step": "fetch_meta_ads_data"}
  thinking_step_end    {}
  thinking_step_start  {"step": "analyze_data"}
  thinking_step_detail {"text": "<thinking delta>"}  (many)
  thinking_step_end    {}
  result               {"answer": "<plain-language answer>"}

Separate code path — zero imports from orchestrator (CLAUDE.md rule 7).
"""
from __future__ import annotations

import json
from typing import Generator

import anthropic

from config import settings
from llm.prompts import LIVE_DATA_QUERY_SYSTEM_PROMPT
from utils.logging import get_logger

logger = get_logger(__name__)


class LiveQueryAgent:
    def __init__(self) -> None:
        self._client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

    def stream_query(
        self,
        question: str,
        account_id: str,
        access_token: str | None = None,
    ) -> Generator[str, None, None]:
        """Yield SSE strings answering `question` using live Meta Ads data for `account_id`."""
        from adapters.meta_ads import get_meta_ads_adapter

        # Phase 1 — fetch live Meta Ads data
        yield f"event: thinking_step_start\ndata: {json.dumps({'step': 'fetch_meta_ads_data'})}\n\n"

        live_data: dict | None = None
        data_available = False
        try:
            adapter = get_meta_ads_adapter(access_token=access_token)
            live_data = adapter.get_live_campaign_context(account_id)
            data_available = bool(
                live_data and (live_data.get("campaigns") or live_data.get("insights"))
            )
            logger.info(
                "live_query_data_fetched",
                account_id=account_id,
                data_available=data_available,
            )
        except Exception as exc:
            logger.warning(
                "live_query_data_fetch_failed",
                account_id=account_id,
                error=str(exc),
            )

        yield f"event: thinking_step_end\ndata: {{}}\n\n"

        # Phase 2 — LLM extended thinking to answer the question
        yield f"event: thinking_step_start\ndata: {json.dumps({'step': 'analyze_data'})}\n\n"

        user_payload = json.dumps({
            "question": question,
            "account_id": account_id,
            "data_available": data_available,
            "live_data": live_data if data_available else None,
        })

        accumulated_text: list[str] = []
        thinking_budget = settings.STRATEGY_THINKING_BUDGET

        with self._client.messages.stream(
            model=settings.CLAUDE_MODEL,
            max_tokens=1024 + thinking_budget,
            thinking={"type": "enabled", "budget_tokens": thinking_budget},
            system=LIVE_DATA_QUERY_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_payload}],
        ) as stream:
            for event in stream:
                if event.type == "content_block_delta":
                    if event.delta.type == "thinking_delta":
                        payload = json.dumps({"text": event.delta.thinking})
                        yield f"event: thinking_step_detail\ndata: {payload}\n\n"
                    elif event.delta.type == "text_delta":
                        accumulated_text.append(event.delta.text)

        yield f"event: thinking_step_end\ndata: {{}}\n\n"

        answer = "".join(accumulated_text).strip() or (
            "I wasn't able to fetch live data for this account right now."
        )
        logger.info(
            "live_query_complete",
            account_id=account_id,
            answer_len=len(answer),
        )
        yield f"event: result\ndata: {json.dumps({'answer': answer})}\n\n"
