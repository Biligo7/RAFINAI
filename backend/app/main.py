"""FastAPI application factory and lifespan."""

from __future__ import annotations

import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from app.config import settings
from app.db.pool import close_pool
from app.db.repository import log_repository_mode
from app.logging import get_logger, setup_logging
from app.routes import chats, config, feedback, health, messages, trails, training, users

logger = get_logger("app")


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    log_repository_mode()

    if settings.sql_enabled and settings.run_migrations_on_startup:
        from app.db.migrations import run_migrations
        try:
            await run_migrations()
        except Exception:
            logger.error("Migration failed; aborting startup")
            raise
    elif not settings.sql_enabled:
        logger.warning("Skipping migrations (no Postgres configured)")
    else:
        logger.info("Skipping migrations (RUN_MIGRATIONS_ON_STARTUP=false)")

    logger.info(
        "Backend listening",
        port=settings.port,
        env=settings.app_env,
        ai_provider_configured=settings.ai_provider,
        ai_provider_resolved=settings.resolved_ai_provider,
        env_file=str(Path(__file__).resolve().parent.parent / ".env"),
    )
    yield

    await close_pool()


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.app_name,
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
        lifespan=lifespan,
    )

    # --- Middleware: request-id ---
    @app.middleware("http")
    async def request_id_middleware(request: Request, call_next):
        incoming = request.headers.get("x-request-id")
        rid = incoming if incoming and len(incoming) <= 128 else str(uuid.uuid4())
        request.state.request_id = rid
        response = await call_next(request)
        response.headers["x-request-id"] = rid
        return response

    # --- Error handler for Pydantic validation ---
    @app.exception_handler(ValidationError)
    async def validation_error_handler(request: Request, exc: ValidationError):
        rid = getattr(request.state, "request_id", "unknown")
        details = "; ".join(
            f"{'.'.join(str(p) for p in e['loc'])}: {e['msg']}" for e in exc.errors()
        )
        return JSONResponse(
            status_code=400,
            content={"error": {"code": "VALIDATION_ERROR", "message": details, "requestId": rid}},
        )

    # --- Routes ---
    app.include_router(health.router)
    app.include_router(config.router)
    app.include_router(chats.router)
    app.include_router(messages.router)
    app.include_router(feedback.router)
    app.include_router(trails.router)
    app.include_router(training.router)
    app.include_router(users.router)

    return app


app = create_app()
