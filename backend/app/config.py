from __future__ import annotations

from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    port: int = 3000
    app_name: str = "RAFINAI"
    app_env: str = "local"
    log_level: str = "info"

    ai_provider: Literal["mock", "azure_openai", "openai_compatible"] = "mock"
    ai_model: str = "mock-gpt"
    ai_system_prompt: str = "You are RAFINAI, an AI-powered sustainable trail companion for Greece."
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

    @property
    def sql_enabled(self) -> bool:
        return bool(self.pg_host and self.pg_database and self.pg_user and self.pg_password)


settings = Settings()
