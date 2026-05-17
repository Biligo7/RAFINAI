from __future__ import annotations

from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

# Always load backend/.env (directory that contains the `app` package), not CWD-relative ".env".
_BACKEND_ROOT = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=_BACKEND_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    port: int = 3000
    app_name: str = "Local Host"
    app_env: str = "local"
    log_level: str = "info"

    ai_provider: Literal["mock", "azure_openai", "openai_compatible"] = "mock"
    ai_model: str = "mock-gpt"
    ai_system_prompt: str = "You are Local Host, an AI-powered sustainable trail companion for Greece."
    ai_temperature: float = 0.4
    ai_max_tokens: int = 2000
    ai_max_history_messages: int = 20
    ai_max_input_chars: int = 12_000

    azure_openai_endpoint: str = ""
    azure_openai_api_key: str = ""
    azure_openai_deployment: str = ""
    azure_openai_api_version: str = "2024-10-21"

    openai_api_key: str = ""
    openai_base_url: str = ""
    openai_model: str = ""

    pg_host: str = ""
    pg_port: int = 5432
    pg_database: str = ""
    pg_user: str = ""
    pg_password: str = ""
    pg_ssl: bool = False

    run_migrations_on_startup: bool = True
    auth_enabled: bool = False

    # Trail data — "mock" uses hardcoded catalog; "live" fetches from OSM/ORS/weather APIs
    trail_source: str = "live"
    ors_api_key: str = ""
    openweather_api_key: str = ""
    # Overpass endpoint (public instance, no key needed)
    overpass_url: str = "https://overpass-api.de/api/interpreter"
    # Cache TTLs in seconds
    trail_cache_ttl: int = 86400       # 24 h for OSM trail data
    weather_cache_ttl: int = 3600      # 1 h for weather
    route_cache_ttl: int = 604800      # 7 days for ORS polylines

    @property
    def openrouteservice_api_key(self) -> str:
        """Alias so hikers_data.py can use settings.openrouteservice_api_key."""
        return self.ors_api_key

    @property
    def sql_enabled(self) -> bool:
        return bool(self.pg_host and self.pg_database and self.pg_user and self.pg_password)

    @property
    def resolved_ai_provider(self) -> Literal["mock", "azure_openai", "openai_compatible"]:
        """Effective provider: explicit AI_PROVIDER wins; else infer from credentials."""
        if self.ai_provider != "mock":
            return self.ai_provider
        if self.openai_api_key.strip():
            return "openai_compatible"
        if (
            self.azure_openai_endpoint.strip()
            and self.azure_openai_api_key.strip()
            and self.azure_openai_deployment.strip()
        ):
            return "azure_openai"
        return "mock"

    @property
    def resolved_chat_model(self) -> str:
        """Model id passed to the chat API (deployment name for Azure, model id for OpenAI)."""
        r = self.resolved_ai_provider
        if r == "openai_compatible":
            return self.openai_model.strip() or self.ai_model
        if r == "azure_openai":
            return self.azure_openai_deployment.strip() or self.ai_model
        return self.ai_model


settings = Settings()
