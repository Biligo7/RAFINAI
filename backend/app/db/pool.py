"""Async Postgres connection pool using asyncpg."""

from __future__ import annotations

import asyncio

import asyncpg

from app.config import settings
from app.logging import get_logger

logger = get_logger("db.pool")

_pool: asyncpg.Pool | None = None


async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is not None:
        return _pool

    ssl_ctx = "require" if settings.pg_ssl else False

    max_attempts = 6
    last_err: Exception | None = None
    for attempt in range(1, max_attempts + 1):
        try:
            _pool = await asyncpg.create_pool(
                host=settings.pg_host,
                port=settings.pg_port,
                database=settings.pg_database,
                user=settings.pg_user,
                password=settings.pg_password,
                ssl=ssl_ctx,
                min_size=1,
                max_size=5,
                command_timeout=10,
            )
            await _pool.fetchval("SELECT 1")
            await logger.ainfo(
                "Postgres connected",
                host=settings.pg_host,
                database=settings.pg_database,
            )
            return _pool
        except Exception as exc:
            last_err = exc
            delay = min(1.0 * 2 ** (attempt - 1), 8.0)
            await logger.awarning(
                "Postgres connect failed, retrying",
                attempt=attempt,
                delay=delay,
            )
            await asyncio.sleep(delay)

    raise last_err or RuntimeError("Postgres connect failed")


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
