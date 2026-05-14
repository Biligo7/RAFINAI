import compression from "compression";
import express, { type Application } from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { logger } from "./logger.js";
import { authPlaceholder } from "./middleware/authPlaceholder.js";
import { errorHandler } from "./middleware/errors.js";
import { requestId } from "./middleware/requestId.js";
import { healthRouter } from "./routes/health.js";
import { configRouter } from "./routes/config.js";
import { chatsRouter } from "./routes/chats.js";
import { messagesRouter } from "./routes/messages.js";
import { feedbackRouter } from "./routes/feedback.js";
import { trainingRouter } from "./routes/training.js";

export function createApp(): Application {
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
  app.use(compression());
  app.use(express.json({ limit: "1mb" }));
  app.use(requestId());
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as unknown as { requestId?: string }).requestId ?? "unknown",
      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return "error";
        if (res.statusCode >= 400) return "warn";
        return "info";
      },
    }),
  );
  app.use(authPlaceholder());

  app.use(healthRouter);
  app.use(configRouter);
  app.use(chatsRouter);
  app.use(messagesRouter);
  app.use(feedbackRouter);
  app.use(trainingRouter);

  app.use(errorHandler());

  return app;
}
