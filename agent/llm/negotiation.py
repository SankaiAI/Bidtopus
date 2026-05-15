"""LLM Negotiation Layer.

Answers: "How do I explain this underwriting result and what do I offer?"

Receives ML underwriting output + contract terms.
Returns a structured AgentOffer validated by Pydantic before returning to orchestrator.

Security:
  - System prompt is a fixed constant (prompts.py) — never interpolated.
  - Merchant-controlled fields go in the user turn as structured JSON.
  - LLM output is validated by Pydantic with field constraints.
  - Extended thinking (5000 tokens) for better counteroffer quality.
"""
from __future__ import annotations

import json
from typing import Any, Generator

import anthropic
from pydantic import ValidationError

from config import settings
from exceptions import LLMValidationError, SafeAgentError
from models.types import AgentOffer, ContractTerms, UnderwritingResult
from utils.logging import get_logger
from llm.prompts import NEGOTIATION_SYSTEM_PROMPT

logger = get_logger(__name__)


class NegotiationLayer:
    """Generates structured offers from ML underwriting results."""

    def __init__(self) -> None:
        self._client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

    def generate_offer(
        self,
        contract_terms: ContractTerms,
        underwriting_result: UnderwritingResult,
    ) -> tuple[AgentOffer, str | None]:
        user_payload = json.dumps({
            "underwriting_result": underwriting_result.model_dump(),
            "contract_terms": contract_terms.model_dump(),
        })

        response = self._client.messages.create(
            model=settings.CLAUDE_MODEL,
            max_tokens=1024 + settings.NEGOTIATION_THINKING_BUDGET,
            thinking={
                "type": "enabled",
                "budget_tokens": settings.NEGOTIATION_THINKING_BUDGET,
            },
            system=NEGOTIATION_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_payload}],
        )

        thinking = self._extract_thinking(response)
        if thinking:
            logger.info(
                "llm_thinking",
                contract_id=contract_terms.contract_id,
                component="negotiation",
                thinking_tokens=settings.NEGOTIATION_THINKING_BUDGET,
                thinking=thinking,
            )

        raw_text = self._extract_text(response)
        offer = self._validate(raw_text, contract_terms.contract_id)

        logger.info(
            "negotiation_offer_generated",
            contract_id=contract_terms.contract_id,
            offer_type=offer.offer_type,
            model=settings.CLAUDE_MODEL,
        )
        return offer, thinking

    def iter_offer_events(
        self,
        contract_terms: ContractTerms,
        underwriting_result: UnderwritingResult,
    ) -> Generator[tuple[str, Any], None, None]:
        """Yields ('thinking', str) deltas then a final ('result', AgentOffer)."""
        user_payload = json.dumps({
            "underwriting_result": underwriting_result.model_dump(),
            "contract_terms": contract_terms.model_dump(),
        })
        accumulated_text: list[str] = []

        with self._client.messages.stream(
            model=settings.CLAUDE_MODEL,
            max_tokens=1024 + settings.NEGOTIATION_THINKING_BUDGET,
            thinking={"type": "enabled", "budget_tokens": settings.NEGOTIATION_THINKING_BUDGET},
            system=NEGOTIATION_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_payload}],
        ) as stream:
            for event in stream:
                if event.type == "content_block_delta":
                    if event.delta.type == "thinking_delta":
                        yield "thinking", event.delta.thinking
                    elif event.delta.type == "text_delta":
                        accumulated_text.append(event.delta.text)

        offer = self._validate("".join(accumulated_text), contract_terms.contract_id)
        yield "result", offer

    # ── Private ───────────────────────────────────────────────────────────────

    @staticmethod
    def _extract_thinking(response: anthropic.types.Message) -> str | None:
        parts = [block.thinking for block in response.content if block.type == "thinking"]
        return "\n\n".join(parts) if parts else None

    @staticmethod
    def _extract_text(response: anthropic.types.Message) -> str:
        for block in response.content:
            if block.type == "text":
                return block.text
        raise SafeAgentError("LLM returned no text block in negotiation response")

    @staticmethod
    def _validate(raw_text: str, contract_id: str) -> AgentOffer:
        cleaned = raw_text.strip()
        # Strip markdown code fences if present
        if cleaned.startswith("```"):
            lines = cleaned.split("\n")
            cleaned = "\n".join(
                line for line in lines if not line.startswith("```")
            )
        try:
            return AgentOffer.model_validate_json(cleaned)
        except (ValidationError, ValueError) as e:
            logger.error(
                "negotiation_validation_failed",
                contract_id=contract_id,
                raw_output=cleaned[:500],
                error=str(e),
            )
            raise LLMValidationError(
                f"LLM negotiation output failed schema validation: {e}"
            ) from e
