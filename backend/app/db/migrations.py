"""Run schema.sql against Postgres if the migration version has not been applied yet."""

from __future__ import annotations

from pathlib import Path

from app.db.pool import get_pool
from app.logging import get_logger

logger = get_logger("db.migrations")

SCHEMA_VERSION = "001_initial"
SCHEMA_FILE = Path(__file__).resolve().parent / "schema.sql"


async def run_migrations() -> None:
    pool = await get_pool()

    await pool.execute("""
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version text NOT NULL PRIMARY KEY,
            applied_at timestamptz NOT NULL DEFAULT now()
        )
    """)

    row = await pool.fetchrow(
        "SELECT version FROM schema_migrations WHERE version = $1",
        SCHEMA_VERSION,
    )
    if row is not None:
        await logger.ainfo("Migrations already applied", version=SCHEMA_VERSION)
        return

    schema_sql = SCHEMA_FILE.read_text(encoding="utf-8")

    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute(schema_sql)
            await conn.execute(
                "INSERT INTO schema_migrations (version) VALUES ($1)",
                SCHEMA_VERSION,
            )

    await logger.ainfo("Migrations applied", version=SCHEMA_VERSION)
