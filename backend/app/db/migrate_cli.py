"""One-shot DB migration (same logic as startup). Run: python -m app.db.migrate_cli"""

from __future__ import annotations

import asyncio

from app.config import settings
from app.db.migrations import run_migrations
from app.db.pool import close_pool
from app.logging import get_logger, setup_logging

logger = get_logger("migrate")


async def main() -> int:
    setup_logging()
    if not settings.sql_enabled:
        logger.error("Postgres is not configured (set PG_HOST, PG_DATABASE, PG_USER, PG_PASSWORD)")
        return 1
    try:
        await run_migrations()
    except Exception:
        logger.exception("Migration failed")
        return 1
    finally:
        await close_pool()
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
