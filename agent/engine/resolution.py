"""Deterministic Resolution Engine.

THE most critical component in the system. Pure logic — no ML, no LLM.
The agent's USDC payout depends on this. It must be unambiguous and auditable.

Resolution rule (from PRD):
    IF total_spend >= minimum_spend
    AND final_roas >= target_roas
    AND evaluation_window_complete
    THEN outcome = success
    ELSE outcome = failure

This module has zero imports from llm/, ml/, or adapters/.
"""
from __future__ import annotations

from models.types import ResolutionInput, ResolutionResult
from utils.logging import get_logger

logger = get_logger(__name__)


class ResolutionEngine:
    """Evaluates whether a performance contract was fulfilled.

    Stateless — safe to construct per-call and safe to re-run on crash recovery.
    """

    def resolve(self, inputs: ResolutionInput) -> ResolutionResult:
        """Evaluate contract outcome deterministically.

        Logs the decision to stdout; the orchestrator logs to audit_events.
        """
        minimum_spend_met = inputs.final_spend >= inputs.minimum_spend
        target_met = inputs.final_roas >= inputs.target_roas
        outcome = (
            "success"
            if (minimum_spend_met and target_met and inputs.evaluation_window_complete)
            else "failure"
        )

        result = ResolutionResult(
            outcome=outcome,
            final_spend=inputs.final_spend,
            final_revenue=inputs.final_revenue,
            final_roas=inputs.final_roas,
            threshold=inputs.target_roas,
            minimum_spend=inputs.minimum_spend,
            minimum_spend_met=minimum_spend_met,
            target_met=target_met,
            evaluation_window_complete=inputs.evaluation_window_complete,
        )

        logger.info(
            "resolution_complete",
            contract_id=inputs.contract_id,
            outcome=outcome,
            final_roas=inputs.final_roas,
            target_roas=inputs.target_roas,
            final_spend=inputs.final_spend,
            minimum_spend=inputs.minimum_spend,
        )
        return result
