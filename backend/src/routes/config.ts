import { Router } from "express";
import { config } from "../config.js";
import type { AppConfigResponse } from "../types/api.js";

export const configRouter = Router();

configRouter.get("/api/config", (_req, res) => {
  // CRITICAL: never include API keys, SQL connection strings, or any secret here.
  const body: AppConfigResponse = {
    appName: config.appName,
    environment: config.appEnv,
    aiProvider: config.ai.provider,
    model: config.ai.model,
    streamingEnabled: true,
    authEnabled: config.flags.authEnabled,
  };
  res.json(body);
});
