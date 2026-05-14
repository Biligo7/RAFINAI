import { logger } from "../logger.js";
import { getRepository } from "../db/repository.js";

// Lightweight telemetry helper. Every event is logged to stdout; if SQL is
// configured the event also lands in `dbo.app_events`. Failures here must never
// break a request, so we swallow errors on the SQL path.
export async function recordEvent(input: {
  requestId?: string | null;
  eventType: string;
  severity: "info" | "warn" | "error";
  message?: string | null;
  properties?: Record<string, unknown> | null;
}): Promise<void> {
  logger[input.severity](
    {
      requestId: input.requestId ?? undefined,
      event: input.eventType,
      properties: input.properties ?? undefined,
    },
    input.message ?? input.eventType,
  );

  try {
    await getRepository().recordEvent(input);
  } catch (err) {
    logger.warn({ err, eventType: input.eventType }, "Failed to persist app event");
  }
}
