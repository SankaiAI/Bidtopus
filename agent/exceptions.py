"""Agent-wide exception hierarchy.

All agent errors inherit from AgentError so callers can catch broadly or narrowly.
SafeAgentError subclasses are safety-rule violations — always log before raising.
AdapterError subclasses are external API failures — may be retried by the caller.
"""


class AgentError(Exception):
    """Base class for all agent errors."""


# ── Safety / structural errors ────────────────────────────────────────────────

class SafeAgentError(AgentError):
    """A safety rule was violated. The action was blocked and not executed."""


class LLMValidationError(SafeAgentError):
    """LLM output failed Pydantic schema validation."""


class ApprovalError(SafeAgentError):
    """Action blocked: strategy not approved in DB, or approval status invalid."""


class StateError(SafeAgentError):
    """Action is invalid for the contract's current state."""


class NegotiationLimitError(SafeAgentError):
    """Negotiation turn limit reached — auto-rejected."""


# ── Adapter / external errors ─────────────────────────────────────────────────

class AdapterError(AgentError):
    """An external adapter call failed."""


class MetaAdsError(AdapterError):
    """Meta Ads adapter error."""


class ArcError(AdapterError):
    """Arc escrow adapter error."""


class CircleError(AdapterError):
    """Circle Wallets API error."""
