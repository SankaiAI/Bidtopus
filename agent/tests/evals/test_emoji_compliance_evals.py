"""LLM emoji-compliance eval (issue #87).

Generates a small batch of offer messages on thematic contracts that have
historically triggered post-2017 emoji choices (capybaras, mythical beasts,
plants), then asserts the model's actual output contains no codepoint
outside `EMOJI_ALLOWLIST_CHARS`.

Skipped in CI unless ANTHROPIC_API_KEY is set — same gating as the other
eval files in this directory.
"""
from __future__ import annotations

import os

import pytest

from agent.llm.negotiation import NegotiationLayer
from agent.llm.prompts import find_disallowed_emoji
from agent.models.types import ContractTerms, UnderwritingResult

pytestmark = pytest.mark.skipif(
    not os.getenv("ANTHROPIC_API_KEY"),
    reason="ANTHROPIC_API_KEY not set — skipping LLM evals",
)


@pytest.fixture(scope="module")
def negotiation():
    return NegotiationLayer()


def _terms(contract_id: str, goal: str) -> ContractTerms:
    return ContractTerms(
        contract_id=contract_id,
        requested_target_roas=2.0,
        minimum_spend=500.0,
        time_window_days=7,
        success_fee_usdc=100.0,
        campaign_type="optimize",
        campaign_goal=goal,
    )


def _underwriting() -> UnderwritingResult:
    return UnderwritingResult(
        success_probability=0.80,
        risk_level="low",
        expected_roas_range=(1.8, 2.4),
        recommendation="accept",
        recommended_fee_usdc=100.0,
    )


# These themes have all triggered post-2017 emoji choices in earlier
# manual repros — capybara → beaver, mammoth → mammoth, plant → herb, etc.
_THEMATIC_GOALS = [
    "Drive sales for our plush capybara toy collection",
    "Promote our handcrafted houseplant subscription boxes",
    "Launch our mythical-creature-themed children's book series",
    "Sell our line of stuffed mammoth and woolly rhinoceros plushies",
    "Increase orders for our gourmet fungi growing kits",
]


@pytest.mark.parametrize("goal", _THEMATIC_GOALS)
def test_thematic_offer_contains_only_allowlisted_emojis(negotiation, goal):
    offer, _thinking = negotiation.generate_offer(
        _terms(f"eval-emoji-{abs(hash(goal)) % 1000:03d}", goal),
        _underwriting(),
    )
    bad = find_disallowed_emoji(offer.message)
    assert bad == [], (
        f"Offer for goal {goal!r} contains disallowed emojis: "
        + ", ".join(f"U+{cp:04X}({ch})" for cp, ch in bad)
        + f"\nFull message: {offer.message!r}"
    )
