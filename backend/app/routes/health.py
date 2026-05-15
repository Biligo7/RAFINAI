from __future__ import annotations

from fastapi import APIRouter

from app.config import settings
from app.db.pool import get_pool

router = APIRouter()


@router.get("/healthz")
async def healthz():
    return {"status": "ok", "service": "backend"}


@router.get("/readyz")
async def readyz():
    if not settings.sql_enabled:
        return {"status": "ready", "database": "memory", "appEnv": settings.app_env}
    try:
        pool = await get_pool()
        await pool.fetchval("SELECT 1")
        return {"status": "ready", "database": "ok", "appEnv": settings.app_env}
    except Exception:
        return {"status": "not_ready", "database": "unavailable", "appEnv": settings.app_env}
