import { createApp } from "./app.js";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { closePool } from "./db/pool.js";
import { runMigrations } from "./db/migrations.js";
import { logRepositoryMode } from "./db/repository.js";

async function main(): Promise<void> {
  logRepositoryMode();

  if (config.sql.enabled && config.flags.runMigrationsOnStartup) {
    try {
      await runMigrations();
    } catch (err) {
      logger.error({ err }, "Migration failed; aborting startup");
      throw err;
    }
  } else if (!config.sql.enabled) {
    logger.warn("Skipping migrations (no Postgres configured)");
  } else {
    logger.info("Skipping migrations (RUN_MIGRATIONS_ON_STARTUP=false)");
  }

  const app = createApp();
  const server = app.listen(config.port, () => {
    logger.info({ port: config.port, env: config.appEnv }, "Backend listening");
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Shutting down");
    server.close(async () => {
      await closePool().catch((err) => logger.warn({ err }, "Error closing Postgres pool"));
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  logger.error({ err }, "Fatal startup error");
  process.exit(1);
});
