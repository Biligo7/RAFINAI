import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "../logger.js";
import { getPool } from "./pool.js";

const SCHEMA_VERSION = "001_initial";

export async function runMigrations(): Promise<void> {
  const pool = await getPool();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version text NOT NULL PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const existing = await pool.query<{ version: string }>(
    "SELECT version FROM schema_migrations WHERE version = $1",
    [SCHEMA_VERSION],
  );
  if (existing.rows.length > 0) {
    logger.info({ version: SCHEMA_VERSION }, "Migrations already applied");
    return;
  }

  const here = dirname(fileURLToPath(import.meta.url));
  const schemaPath = await locateSchema(here);
  const schema = await readFile(schemaPath, "utf8");

  // Postgres can run a multi-statement string in a single query call as long as
  // no parameters are bound. Wrap in a transaction so the whole schema either
  // applies or rolls back.
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(schema);
    await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [SCHEMA_VERSION]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }

  logger.info({ version: SCHEMA_VERSION }, "Migrations applied");
}

async function locateSchema(startDir: string): Promise<string> {
  // Sibling first (dist/db/migrations.js → dist/db/schema.sql, or
  // src/db/migrations.ts → src/db/schema.sql in dev).
  const sibling = join(startDir, "schema.sql");
  try {
    await readFile(sibling, "utf8");
    return sibling;
  } catch {
    // Fall through.
  }
  const fallback = join(startDir, "..", "..", "src", "db", "schema.sql");
  return fallback;
}
