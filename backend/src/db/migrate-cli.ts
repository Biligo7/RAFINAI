import { runMigrations } from "./migrations.js";
import { closePool } from "./pool.js";
import { logger } from "../logger.js";

(async () => {
  try {
    await runMigrations();
    await closePool();
    process.exit(0);
  } catch (err) {
    logger.error({ err }, "Migration failed");
    await closePool().catch(() => undefined);
    process.exit(1);
  }
})();
