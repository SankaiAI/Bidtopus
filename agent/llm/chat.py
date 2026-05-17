"""Chat Q&A — grounded in real tool results from the DB.

Answers merchant questions about their contract using actual data, never fabricated output.

Rules enforced here:
  - Zero imports from orchestrator (chat Q&A is a separate code path)
  - System prompt is a fixed constant — never interpolated
  - LLM MUST call get_contract_context before answering contract questions
  - Tool execution reads from DB and audit log; no side effects
"""
from __future__ import annotations

import json
from typing import Generator

import anthropic
from sqlalchemy.orm import Session

from config import settings
from utils.logging import get_logger
from llm.prompts import CHAT_SYSTEM_PROMPT

logger = get_logger(__name__)

_CHAT_TOOLS: list[dict] = [
    {
        "name": "get_contract_context",
        "description": (
            "Retrieve real data for this contract: UUID, current status, agreed terms, "
            "ML underwriting results (success probability, risk level, expected ROAS range, recommendation), "
            "the agent's negotiation offer, and the count of timeline messages. "
            "ALWAYS call this before answering any question about a specific contract."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "contract_id": {"type": "string", "description": "The contract UUID"}
            },
            "required": ["contract_id"],
        },
    }
]

_MAX_TOOL_ROUNDS = 3


class ChatAgent:
    """Tool-use chat agent. Reads from DB; never imports from orchestrator."""

    def __init__(self, db: Session) -> None:
        self._client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
        self._db = db

    # ── Public ────────────────────────────────────────────────────────────────

    def respond(
        self,
        contract_id: str,
        user_message: str,
        prior_messages: list[dict] | None = None,
    ) -> tuple[str, list[str]]:
        """Return (response_text, tools_called). Blocks until complete."""
        messages = list(prior_messages or [])
        messages.append({"role": "user", "content": user_message})
        tools_called: list[str] = []
        response = None

        for _ in range(_MAX_TOOL_ROUNDS):
            response = self._client.messages.create(
                model=settings.CLAUDE_MODEL,
                max_tokens=1024,
                system=CHAT_SYSTEM_PROMPT,
                tools=_CHAT_TOOLS,
                messages=messages,
            )

            if response.stop_reason != "tool_use":
                break

            tool_results = []
            for block in response.content:
                if block.type == "tool_use":
                    tools_called.append(block.name)
                    result = self._execute_tool(block.name, block.input, contract_id)
                    logger.info(
                        "chat_tool_executed",
                        contract_id=contract_id,
                        tool=block.name,
                        keys=list(result.keys()),
                    )
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": json.dumps(result),
                    })

            messages.append({"role": "assistant", "content": response.content})
            messages.append({"role": "user", "content": tool_results})

        text = self._extract_text(response) if response else "I could not process your request."
        return text, tools_called

    def stream_respond(
        self,
        contract_id: str,
        user_message: str,
        prior_messages: list[dict] | None = None,
    ) -> Generator[str, None, None]:
        """Yield SSE strings: tool_call events then streamed text_delta events."""
        messages = list(prior_messages or [])
        messages.append({"role": "user", "content": user_message})

        # Tool use rounds (sync, fast DB reads)
        for _ in range(_MAX_TOOL_ROUNDS):
            response = self._client.messages.create(
                model=settings.CLAUDE_MODEL,
                max_tokens=512,
                system=CHAT_SYSTEM_PROMPT,
                tools=_CHAT_TOOLS,
                messages=messages,
            )

            if response.stop_reason != "tool_use":
                break

            tool_results = []
            for block in response.content:
                if block.type == "tool_use":
                    yield f"event: tool_call\ndata: {json.dumps({'name': block.name})}\n\n"
                    result = self._execute_tool(block.name, block.input, contract_id)
                    logger.info(
                        "chat_tool_executed",
                        contract_id=contract_id,
                        tool=block.name,
                        keys=list(result.keys()),
                    )
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": json.dumps(result),
                    })

            messages.append({"role": "assistant", "content": response.content})
            messages.append({"role": "user", "content": tool_results})

        # Final response — stream text only, no further tool calls
        with self._client.messages.stream(
            model=settings.CLAUDE_MODEL,
            max_tokens=1024,
            system=CHAT_SYSTEM_PROMPT,
            messages=messages,
        ) as stream:
            for event in stream:
                if event.type == "content_block_delta" and event.delta.type == "text_delta":
                    yield f"event: text_delta\ndata: {json.dumps({'text': event.delta.text})}\n\n"

        yield f"event: done\ndata: {{}}\n\n"

    # ── Private ───────────────────────────────────────────────────────────────

    def _execute_tool(self, name: str, input_data: dict, contract_id: str) -> dict:
        if name == "get_contract_context":
            return self._get_contract_context(contract_id)
        return {"error": f"Unknown tool: {name}"}

    def _get_contract_context(self, contract_id: str) -> dict:
        """Read real contract data from DB and audit log. No side effects."""
        import uuid as _uuid

        from db.backend_models import PerformanceContractORM
        from db.audit_logger import AuditLogger
        from db.messages_repo import MessagesRepo

        contract = (
            self._db.query(PerformanceContractORM)
            .filter(PerformanceContractORM.id == _uuid.UUID(contract_id))
            .first()
        )
        if not contract:
            return {"error": f"Contract {contract_id} not found in database"}

        audit = AuditLogger(self._db)

        # Real ML underwriting result
        uw_events = audit.get_by_component(contract_id, "ml_underwriting")
        result_events = [e for e in uw_events if e.event_type == "result"]
        underwriting_result = (
            result_events[-1].payload.get("outputs") if result_events else None
        )

        # Latest negotiation offer from the LLM
        llm_events = audit.get_llm_decisions(contract_id)
        negotiation_results = [
            e.payload for e in llm_events
            if e.component == "llm_negotiation" and e.event_type == "result"
        ]
        latest_offer = negotiation_results[-1] if negotiation_results else None

        messages_repo = MessagesRepo(self._db)
        timeline_count = len(messages_repo.get_all(contract_id))

        return {
            "contract_id": contract_id,
            "status": contract.status,
            "terms": {
                "target_roas": contract.target_roas,
                "minimum_spend": contract.minimum_spend,
                "time_window_days": contract.time_window_days,
                "success_fee_usdc": contract.success_fee_usdc,
                "campaign_type": contract.campaign_type,
                "campaign_goal": contract.campaign_goal or "",
            },
            "ml_underwriting": underwriting_result,
            "latest_negotiation_offer": latest_offer,
            "timeline_message_count": timeline_count,
        }

    @staticmethod
    def _extract_text(response: anthropic.types.Message) -> str:
        for block in response.content:
            if block.type == "text":
                return block.text
        return ""
