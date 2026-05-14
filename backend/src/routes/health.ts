import { Router } from "express";
import { config } from "../config.js";
import { getPool, isSqlEnabled } from "../db/pool.js";

export const healthRouter = Router();

healthRouter.get("/healthz", (_req, res) => {
  res.json({ status: "ok", service: "backend" });
});

healthRouter.get("/readyz", async (_req, res) => {
  if (!isSqlEnabled()) {
    // No Postgres configured — the in-memory store is always ready.
    res.json({ status: "ready", database: "memory", appEnv: config.appEnv });
    return;
  }

  try {
    const pool = await getPool();
    await pool.query("SELECT 1 AS ok");
    res.json({ status: "ready", database: "ok", appEnv: config.appEnv });
  } catch {
    res.status(503).json({ status: "not_ready", database: "unavailable", appEnv: config.appEnv });
  }
});
