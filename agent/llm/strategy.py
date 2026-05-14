"""LLM Strategy Generator.

Answers: "What Meta Ads strategy should I run to hit the contracted target?"

Receives approved contract terms + account context.
Returns a structured StrategyPlan validated by Pydantic.
The plan is surfaced to the merchant as an approval_request before any action executes.

Security:
  - System prompt is a fixed constant — never interpolated.
  - Merchant fields go in user turn as structured JSON.
  - Extended thinking (8000 tokens) for richer campaign planning.
"""
from __future__ import annotations

import json

import anthropic
from pydantic import ValidationError

from config import settings
from exceptions import LLMValidationError, SafeAgentError
from models.types import AccountContext, ContractTerms, StrategyPlan
from utils.logging import get_logger
from llm.prompts import STRATEGY_SYSTEM_PROMPT

logger = get_logger(__name__)


class StrategyGenerator:
    def __init__(self) -> None:
        self._client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

    def generate_strategy(
        self,
        contract_terms: ContractTerms,
        account_context: AccountContext,
    ) -> StrategyPlan:
        user_payload = json.dumps({
            "contract_terms": contract_terms.model_dump(),
            "account_context": account_context.model_dump(),
        })

        response = self._client.messages.create(
            model=settings.CLAUDE_MODEL,
            max_tokens=2048 + settings.STRATEGY_THINKING_BUDGET,
            thinking={
                "type": "enabled",
                "budget_tokens": settings.STRATEGY_THINKING_BUDGET,
            },
            system=STRATEGY_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_payload}],
        )

        thinking = self._extract_thinking(response)
        if thinking:
            logger.info(
                "llm_thinking",
                contract_id=contract_terms.contract_id,
                component="strategy",
                thinking_tokens=settings.STRATEGY_THINKING_BUDGET,
                thinking=thinking,
            )

        raw_text = self._extract_text(response)
        plan = self._validate(raw_text, contract_terms.contract_id)

        logger.info(
            "strategy_generated",
            contract_id=contract_terms.contract_id,
            action_count=len(plan.actions),
            model=settings.CLAUDE_MODEL,
        )
        return plan

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
        raise SafeAgentError("LLM returned no text block in strategy response")

    @staticmethod
    def _validate(raw_text: str, contract_id: str) -> StrategyPlan:
        cleaned = raw_text.strip()
        if cleaned.startswith("```"):
            lines = cleaned.split("\n")
            cleaned = "\n".join(
                line for line in lines if not line.startswith("```")
            )
        try:
            return StrategyPlan.model_validate_json(cleaned)
        except (ValidationError, ValueError) as e:
            logger.error(
                "strategy_validation_failed",
                contract_id=contract_id,
                raw_output=cleaned[:500],
                error=str(e),
            )
            raise LLMValidationError(
                f"LLM strategy output failed schema validation: {e}"
            ) from e
