"""ML Live Outcome Forecast Model.

Answers: "Given current campaign progress, will this contract succeed by the deadline?"

Runs on every daily monitoring tick. Feeds the live dashboard and determines
whether mid-flight optimizations are needed.

Architecture:
  Rule-based + statistical hybrid for MVP.
  The pure rule-based component handles edge cases (day 0, no spend).
  The regression component extrapolates the ROAS trajectory.

Status thresholds:
  on_track  → predicted success probability >= ACCEPT_THRESHOLD (0.65)
  at_risk   → 0.35 <= probability < 0.65
  off_track → probability < 0.35
"""
from __future__ import annotations

from config import settings
from models.types import ForecastInput, ForecastResult
from utils.logging import get_logger

logger = get_logger(__name__)


class ForecastModel:
    """Stateless — construct per-call or share as singleton."""

    def predict(self, inputs: ForecastInput) -> ForecastResult:
        days_total = inputs.days_elapsed + inputs.days_remaining

        if days_total == 0 or inputs.days_elapsed == 0:
            return self._no_data_forecast(inputs)

        predicted_roas = self._extrapolate_roas(inputs)
        predicted_spend = self._extrapolate_spend(inputs)
        prob = self._compute_probability(inputs, predicted_roas, predicted_spend)
        status = self._status(prob)

        logger.info(
            "forecast_complete",
            days_elapsed=inputs.days_elapsed,
            days_remaining=inputs.days_remaining,
            current_roas=inputs.current_roas,
            predicted_roas=predicted_roas,
            probability=prob,
            status=status,
        )

        return ForecastResult(
            predicted_final_roas=round(predicted_roas, 3),
            predicted_final_spend=round(predicted_spend, 2),
            success_probability=round(prob, 4),
            status=status,
        )

    # ── Private helpers ───────────────────────────────────────────────────────

    def _extrapolate_roas(self, inputs: ForecastInput) -> float:
        """Linear extrapolation of cumulative ROAS trajectory."""
        days_total = inputs.days_elapsed + inputs.days_remaining

        # Revenue and spend grow as the campaign matures — ROAS can improve
        # as the algorithm optimises. Apply a modest improvement factor.
        improvement_factor = 1.0 + 0.02 * min(inputs.days_remaining, 7)
        extrapolated = inputs.current_roas * improvement_factor

        # Weight current performance more heavily as we get closer to end
        progress = inputs.days_elapsed / days_total
        blended = inputs.current_roas * progress + extrapolated * (1 - progress)
        return max(blended, 0.0)

    def _extrapolate_spend(self, inputs: ForecastInput) -> float:
        """Project final spend assuming current daily rate continues."""
        if inputs.days_elapsed == 0:
            return 0.0
        daily_rate = inputs.current_spend / inputs.days_elapsed
        days_total = inputs.days_elapsed + inputs.days_remaining
        return daily_rate * days_total

    def _compute_probability(
        self, inputs: ForecastInput, predicted_roas: float, predicted_spend: float
    ) -> float:
        days_total = inputs.days_elapsed + inputs.days_remaining
        progress = inputs.days_elapsed / days_total if days_total > 0 else 0

        # ROAS component: how far are we from target?
        roas_ratio = predicted_roas / inputs.target_roas if inputs.target_roas > 0 else 0
        roas_prob = min(roas_ratio * 0.85, 0.95)

        # Spend component: are we on track to meet minimum spend?
        spend_ratio = (
            predicted_spend / inputs.minimum_spend if inputs.minimum_spend > 0 else 1.0
        )
        spend_prob = min(spend_ratio, 1.0)

        # Confidence increases as more data is available
        confidence = 0.5 + 0.5 * progress
        base_prob = roas_prob * spend_prob
        return max(min(base_prob * confidence + (1 - confidence) * 0.5, 0.95), 0.05)

    def _status(self, prob: float) -> str:
        if prob >= settings.ACCEPT_THRESHOLD:
            return "on_track"
        elif prob >= settings.COUNTER_LOW:
            return "at_risk"
        return "off_track"

    def _no_data_forecast(self, inputs: ForecastInput) -> ForecastResult:
        return ForecastResult(
            predicted_final_roas=0.0,
            predicted_final_spend=0.0,
            success_probability=0.5,
            status="at_risk",
        )
