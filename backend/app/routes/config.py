from __future__ import annotations

from fastapi import APIRouter

from app.config import settings
from app.models import AppConfigResponse

router = APIRouter()


@router.get("/api/config")
async def get_config() -> AppConfigResponse:
    return AppConfigResponse(
        appName=settings.app_name,
        environment=settings.app_env,
        aiProvider=settings.ai_provider,
        model=settings.ai_model,
        streamingEnabled=True,
        authEnabled=settings.auth_enabled,
    )
