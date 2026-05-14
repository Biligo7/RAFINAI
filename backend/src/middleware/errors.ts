import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { logger } from "../logger.js";
import type { ApiErrorBody, ErrorCode } from "../types/api.js";

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;

  constructor(code: ErrorCode, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export const NotFound = (msg = "Not found") => new ApiError("NOT_FOUND", msg, 404);
export const Validation = (msg: string) => new ApiError("VALIDATION_ERROR", msg, 400);
export const Database = (msg = "Database error") => new ApiError("DATABASE_ERROR", msg, 500);
export const AIProvider = (msg = "AI provider error") => new ApiError("AI_PROVIDER_ERROR", msg, 502);
export const Unauthorized = (msg = "Unauthorized") => new ApiError("UNAUTHORIZED", msg, 401);

export function errorHandler() {
  // Express recognises 4-arg signatures as error handlers, so all four parameters
  // must be present even if `next` is unused.
  return (err: unknown, req: Request, res: Response, _next: NextFunction): void => {
    const requestId = req.requestId ?? "unknown";

    let body: ApiErrorBody;
    let status = 500;

    if (err instanceof ApiError) {
      status = err.status;
      body = { error: { code: err.code, message: err.message, requestId } };
    } else if (err instanceof ZodError) {
      status = 400;
      const message = err.errors.map((e) => `${e.path.join(".") || "(root)"}: ${e.message}`).join("; ");
      body = { error: { code: "VALIDATION_ERROR", message, requestId } };
    } else {
      const message = err instanceof Error ? err.message : "Internal error";
      body = { error: { code: "INTERNAL_ERROR", message, requestId } };
    }

    if (status >= 500) {
      logger.error({ requestId, err, status }, "Unhandled error");
    } else {
      logger.warn({ requestId, code: body.error.code, message: body.error.message, status }, "Request failed");
    }

    if (res.headersSent) {
      res.end();
      return;
    }
    res.status(status).json(body);
  };
}
