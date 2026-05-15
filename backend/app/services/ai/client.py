"""Resolve the configured AI provider."""

from __future__ import annotations

from app.config import settings
from app.logging import get_logger

logger = get_logger("ai.client")

_cached_provider = None


def get_ai_provider():
    global _cached_provider
    if _cached_provider is not None:
        return _cached_provider

    if settings.ai_provider == "azure_openai":
        from app.services.ai.azure_openai_provider import AzureOpenAIProvider
        _cached_provider = AzureOpenAIProvider(
            endpoint=settings.azure_openai_endpoint,
            api_key=settings.azure_openai_api_key,
            deployment=settings.azure_openai_deployment,
            api_version=settings.azure_openai_api_version,
        )
    elif settings.ai_provider == "openai_compatible":
        from app.services.ai.openai_provider import OpenAICompatibleProvider
        _cached_provider = OpenAICompatibleProvider(
            api_key=settings.openai_api_key,
            base_url=settings.openai_base_url,
            default_model=settings.openai_model,
        )
    else:
        from app.services.ai.mock_provider import mock_provider
        _cached_provider = mock_provider

    logger.info("AI provider selected", provider=_cached_provider.name, model=settings.ai_model)
    return _cached_provider
