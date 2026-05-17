"""Run schema migrations against Postgres in order."""

from __future__ import annotations

from pathlib import Path

from app.db.pool import get_pool
from app.logging import get_logger

logger = get_logger("db.migrations")

_MIGRATIONS_DIR = Path(__file__).resolve().parent

MIGRATIONS: list[tuple[str, Path]] = [
    ("001_initial", _MIGRATIONS_DIR / "schema.sql"),
    ("002_user_preferences", _MIGRATIONS_DIR / "002_user_preferences.sql"),
    ("003_app_users_external_subject_unique_fix", _MIGRATIONS_DIR / "003_app_users_external_subject_unique_fix.sql"),
    ("004_trails_cache", _MIGRATIONS_DIR / "004_trails_cache.sql"),
]


async def run_migrations() -> None:
    pool = await get_pool()

    await pool.execute("""
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version text NOT NULL PRIMARY KEY,
            applied_at timestamptz NOT NULL DEFAULT now()
        )
    """)

    # Older main branch applied the full schema under a single version key.
    legacy = await pool.fetchrow(
        "SELECT 1 FROM schema_migrations WHERE version = $1",
        "002_user_scoped_chats",
    )
    if legacy:
        already = await pool.fetchrow(
            "SELECT 1 FROM schema_migrations WHERE version = $1",
            "001_initial",
        )
        if not already:
            await pool.execute(
                "INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT (version) DO NOTHING",
                "001_initial",
            )

    for version, sql_file in MIGRATIONS:
        row = await pool.fetchrow(
            "SELECT version FROM schema_migrations WHERE version = $1",
            version,
        )
        if row is not None:
            continue

        schema_sql = sql_file.read_text(encoding="utf-8")

        async with pool.acquire() as conn:
            async with conn.transaction():
                await conn.execute(schema_sql)
                await conn.execute(
                    "INSERT INTO schema_migrations (version) VALUES ($1)",
                    version,
                )

        await logger.ainfo("Migration applied", version=version)

    await logger.ainfo("All migrations up to date")
