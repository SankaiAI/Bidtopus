import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str
    clerk_secret_key: str
    anthropic_api_key: str = ""
    meta_ads_access_token: str = ""
    meta_ads_account_id: str = ""
    circle_api_key: str = ""
    settler_private_key: str = ""
    agent_base_url: str = "http://localhost:8001"
    environment: str = "development"
    allowed_origins: str = "http://localhost:3000"

    clerk_publishable_key: str = ""

    model_config = {"env_file": ".env", "case_sensitive": False, "extra": "ignore"}

    @property
    def origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",")]


settings = Settings()
