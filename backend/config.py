import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str
    clerk_secret_key: str
    anthropic_api_key: str = ""
    meta_ads_access_token: str = ""
    meta_ads_account_id: str = ""
    circle_api_key: str = ""
    agent_base_url: str = "http://localhost:8001"
    environment: str = "development"
    allowed_origins: str = "http://localhost:3000"

    clerk_publishable_key: str = ""

    # Arc / contracts — used to verify fund() tx hashes on-chain (see issue #69)
    arc_rpc_url: str = ""
    escrow_contract_address: str = ""

    # Shared secret for agent → backend service-to-service calls (e.g. perf ingest, issue #79)
    agent_service_token: str = ""

    # Meta Ads OAuth popup flow (issue #91)
    meta_app_id: str = ""
    meta_app_secret: str = ""
    meta_redirect_uri: str = "http://localhost:8000/api/auth/meta/callback"

    # SIWE wallet-connect (issue #84). Domain the SIWE message must declare —
    # frontend signs with this host so a leaked signature from one deploy can't
    # be replayed against another.
    siwe_domain: str = "localhost:3000"
    # Arc chain id the SIWE message must declare. Testnet = 5042002.
    arc_chain_id: int = 5042002
    # SIWE nonce lifetime in seconds.
    siwe_nonce_ttl_seconds: int = 300

    model_config = {"env_file": ".env", "case_sensitive": False, "extra": "ignore"}

    @property
    def origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",")]


settings = Settings()
