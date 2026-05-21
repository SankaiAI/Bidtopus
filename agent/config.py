"""Central configuration — all thresholds and env vars live here.

Every decision threshold is sourced from this module. Never hardcode a threshold
in a service or adapter; always import from config.settings.
"""
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ── LLM ──────────────────────────────────────────────────────────────────
    ANTHROPIC_API_KEY: str = ""
    CLAUDE_MODEL: str = "claude-sonnet-4-6"
    NEGOTIATION_THINKING_BUDGET: int = 1024
    STRATEGY_THINKING_BUDGET: int = 1024

    # ── Database ──────────────────────────────────────────────────────────────
    DATABASE_URL: str = "postgresql://localhost/outcomex"

    # ── Circle Wallets ────────────────────────────────────────────────────────
    CIRCLE_API_KEY: str = ""
    CIRCLE_WALLET_SET_ID: str = ""
    AGENT_WALLET_ID: str = ""
    ENTITY_SECRET: str = ""
    CIRCLE_BASE_URL: str = "https://api.circle.com/v1/w3s"

    # ── Arc / Web3 ────────────────────────────────────────────────────────────
    ARC_RPC_URL: str = ""
    ESCROW_CONTRACT_ADDRESS: str = ""
    CONTRACTS_OUT_DIR: str = str(Path(__file__).parent.parent / "contracts" / "out")
    # Circle blockchain identifier for Arc — used when creating wallets on Arc testnet
    CIRCLE_BLOCKCHAIN: str = "ARC-TESTNET"
    # Arc SCA wallets require feeLevel as a flat top-level field (not nested in fee.config)
    ARC_FEE_LEVEL: str = "MEDIUM"

    # ── Underwriting thresholds ───────────────────────────────────────────────
    ACCEPT_THRESHOLD: float = 0.65
    COUNTER_LOW: float = 0.35
    COUNTER_HIGH: float = 0.64
    REJECT_THRESHOLD: float = 0.35

    # ── Execution thresholds ──────────────────────────────────────────────────
    AUTO_APPROVE_BUDGET_PCT: float = 0.15     # <= 15% change → auto-approve
    APPROVAL_REQUIRED_BUDGET_PCT: float = 0.30  # > 30% change → require approval

    # ── Safety limits ─────────────────────────────────────────────────────────
    MAX_NEGOTIATION_TURNS: int = 5

    # ── ML artifacts ─────────────────────────────────────────────────────────
    MODEL_ARTIFACTS_DIR: str = str(Path(__file__).parent / "ml" / "model_artifacts")

    # ── Meta Ads ──────────────────────────────────────────────────────────────
    META_ADS_ACCESS_TOKEN: str = ""

    # ── Mock flags ────────────────────────────────────────────────────────────
    META_ADS_MOCK: bool = True
    ARC_MOCK: bool = True
    CIRCLE_MOCK: bool = True

    # ── Backend push (agent → backend) ────────────────────────────────────────
    BACKEND_BASE_URL: str = "http://localhost:8000"
    AGENT_SERVICE_TOKEN: str = ""
    # When AGENT_SERVICE_TOKEN is unset, accept all /agent/* calls instead of 503.
    # Default False = fail-closed = production-safe. Set True only for local dev
    # before the secret is configured.
    AGENT_SERVICE_TOKEN_FAIL_OPEN: bool = False

    # ── Monitoring scheduler ──────────────────────────────────────────────────
    MONITORING_TICK_MINUTES: int = 15

    # ── HTTP / deployment ─────────────────────────────────────────────────────
    # Comma-separated allowed origins for CORS. Empty → localhost dev defaults.
    # Production must set this to the backend's origin only (e.g.
    # "https://outcomex-backend.up.railway.app").
    ALLOWED_ORIGINS: str = ""
    # Expose FastAPI's /docs and /redoc UIs. Default False — public docs are a
    # free attack-surface map. Flip to True only for local development.
    ENABLE_DOCS: bool = False
    # Allow /agent/resolve to bypass the evaluation_window_complete check.
    # Default False — server-side guard against premature settlement. Set True
    # only in test/staging where you need to force-resolve mid-window.
    RESOLVE_ALLOW_PREMATURE: bool = False


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
