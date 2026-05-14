import type { NextFunction, Request, Response } from "express";
import { config } from "../config.js";
import { Unauthorized } from "./errors.js";

// Placeholder for authentication. Auth is disabled by default so the app is
// usable end-to-end out of the box. To add real auth:
//
// Option A — Container Apps built-in auth (Easy Auth):
//   Configure the auth provider on the frontend Container App, then trust the
//   `X-MS-CLIENT-PRINCIPAL*` headers it forwards. Read the principal here.
//
// Option B — Microsoft Entra ID with `passport-azure-ad` or `@azure/msal-node`:
//   Validate the bearer JWT on every request, populate `req.user`, and
//   propagate the subject into the SQL layer (write to `app_users.external_subject`).
//
// Until then this middleware is a no-op when AUTH_ENABLED=false.

export function authPlaceholder() {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!config.flags.authEnabled) return next();

    const principal = req.header("x-ms-client-principal");
    if (!principal) return next(Unauthorized("Missing principal"));

    // Decode and attach to req. Replace with real verification.
    next();
  };
}
