import pg from "pg";
import { config } from "../config.js";
import { logger } from "../logger.js";

const { Pool } = pg;

let pool: pg.Pool | null = null;
let connecting: Promise<pg.Pool> | null = null;

export function isSqlEnabled(): boolean {
  return config.sql.enabled;
}

export async function getPool(): Promise<pg.Pool> {
  if (!config.sql.enabled) {
    throw new Error("Postgres is not configured. Set PG_HOST, PG_DATABASE, PG_USER, PG_PASSWORD.");
  }
  if (pool) return pool;
  if (connecting) return connecting;

  connecting = (async () => {
    const cfg: pg.PoolConfig = {
      host: config.sql.host,
      port: config.sql.port,
      database: config.sql.database,
      user: config.sql.user,
      password: config.sql.password,
      ssl: config.sql.ssl ? { rejectUnauthorized: false } : false,
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    };

    // Azure Postgres Flexible Server with auto-stop can take 30-60s to wake.
    // Retry briefly so the first request after idle does not crash the process.
    const maxAttempts = 6;
    let lastErr: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const p = new Pool(cfg);
        await p.query("SELECT 1");
        pool = p;
        connecting = null;
        logger.info({ host: config.sql.host, database: config.sql.database }, "Postgres connected");
        return p;
      } catch (err) {
        lastErr = err;
        const delay = Math.min(1000 * 2 ** (attempt - 1), 8000);
        logger.warn({ attempt, delay, err }, "Postgres connect failed, retrying");
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    connecting = null;
    throw lastErr instanceof Error ? lastErr : new Error("Postgres connect failed");
  })();

  return connecting;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
