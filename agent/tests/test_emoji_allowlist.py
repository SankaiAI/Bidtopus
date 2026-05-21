"""Tests for ticket #87 — restrict LLM-emitted emoji to a font-safe allowlist.

Covers:
  - `find_disallowed_emoji` correctly flags U+1F9AB BEAVER and similar
    post-2017 emojis while accepting everything on the allowlist.
  - All three merchant-facing system prompts (NEGOTIATION / STRATEGY / CHAT)
    embed the allowlist and the rule snippet so the LLM sees it.

The LLM-side check ("real model output complies") lives in tests/evals/
because it requires an Anthropic API call.
"""
from __future__ import annotations

from agent.llm.prompts import (
    CHAT_SYSTEM_PROMPT,
    EMOJI_ALLOWLIST_CHARS,
    NEGOTIATION_SYSTEM_PROMPT,
    STRATEGY_SYSTEM_PROMPT,
    find_disallowed_emoji,
)


class TestFindDisallowedEmoji:
    def test_clean_plain_text_returns_empty(self):
        assert find_disallowed_emoji("Hello, merchant! Your contract is ready.") == []

    def test_allowlist_emoji_returns_empty(self):
        # A sampling of the allowlist
        assert find_disallowed_emoji("Great news \U0001F389 — funds ready \U0001F4B0") == []

    def test_em_dash_and_punctuation_are_ignored(self):
        # U+2014 em-dash is symbol-like but NOT emoji-like; must not be flagged
        text = "Day 3 — ROAS 2.1x — looking good."
        assert find_disallowed_emoji(text) == []

    def test_beaver_is_flagged(self):
        # U+1F9AB BEAVER — the exact codepoint from the ticket's live forensics
        bad = find_disallowed_emoji("Good luck with the capybaras \U0001F9AB")
        assert (0x1F9AB, "\U0001F9AB") in bad

    def test_other_post_2017_emojis_are_flagged(self):
        # A few from the ticket's "specifically avoid" list
        for cp, name in [
            (0x1F9AC, "BISON"),
            (0x1FAB6, "FEATHER"),
            (0x1F9A3, "MAMMOTH"),
            (0x1FAA8, "ROCK"),
            (0x1FA90, "RINGED PLANET"),
        ]:
            ch = chr(cp)
            assert (cp, ch) in find_disallowed_emoji(f"text {ch}"), \
                f"expected {name} (U+{cp:04X}) to be flagged"

    def test_variation_selector_after_warning_is_allowed(self):
        # ⚠️ is U+26A0 + U+FE0F — both must pass
        assert find_disallowed_emoji("⚠️ important note") == []

    def test_mixed_allowed_and_disallowed_returns_only_disallowed(self):
        text = "\U0001F389 great \U0001F9AB run \U0001F680"  # 🎉 ✓, 🦫 ✗, 🚀 ✓
        bad = find_disallowed_emoji(text)
        assert len(bad) == 1
        assert bad[0] == (0x1F9AB, "\U0001F9AB")

    def test_allowlist_chars_itself_is_clean(self):
        """Sanity check: every char in EMOJI_ALLOWLIST_CHARS is on the allowlist."""
        assert find_disallowed_emoji(EMOJI_ALLOWLIST_CHARS) == []


class TestSystemPromptsCarryAllowlist:
    """The whole point of the fix is that the LLM SEES the allowlist. If a
    prompt ever stops embedding the rule, the model loses the constraint."""

    def test_negotiation_prompt_includes_allowlist(self):
        assert "Emoji policy" in NEGOTIATION_SYSTEM_PROMPT
        # Spot-check a couple of literal allowlist chars are in the prompt
        assert "\U0001F389" in NEGOTIATION_SYSTEM_PROMPT  # 🎉
        assert "\U0001F680" in NEGOTIATION_SYSTEM_PROMPT  # 🚀
        # And the beaver should appear in the don't-list
        assert "\U0001F9AB" in NEGOTIATION_SYSTEM_PROMPT

    def test_strategy_prompt_includes_allowlist(self):
        assert "Emoji policy" in STRATEGY_SYSTEM_PROMPT
        assert "\U0001F4B0" in STRATEGY_SYSTEM_PROMPT  # 💰
        assert "\U0001F9AB" in STRATEGY_SYSTEM_PROMPT  # beaver in don't-list

    def test_chat_prompt_includes_allowlist(self):
        assert "Emoji policy" in CHAT_SYSTEM_PROMPT
        assert "\U0001F4CA" in CHAT_SYSTEM_PROMPT      # 📊
        assert "\U0001F9AB" in CHAT_SYSTEM_PROMPT      # beaver

    def test_prompts_remain_string_constants(self):
        """Re-affirms the security invariant (test_security.py covers this too)
        — adding the emoji rule must not turn the prompts into f-strings or
        let merchant data sneak in."""
        for prompt in (NEGOTIATION_SYSTEM_PROMPT, STRATEGY_SYSTEM_PROMPT, CHAT_SYSTEM_PROMPT):
            assert isinstance(prompt, str)
            assert "{contract" not in prompt
            assert "{campaign_goal" not in prompt
            assert "{account_id" not in prompt
