# Customization

This is the single source of truth for customizing the template. AI coding assistants should also read [`AGENTS.md`](../AGENTS.md) for an at-a-glance map with file:line references.

## Decide what to customize

Most forks change these in roughly this order. You can stop at any step — the template is usable end-to-end after step 1 alone.

1. **System prompt + starter prompts** — defines the assistant's persona and seeds the empty state. (1 env var + 4 strings)
2. **App name + branding colors** — makes the UI look like your product. (1 env var + CSS variables)
3. **AI provider + credentials** — switches off the `mock` provider for a real model. (Terraform variables)
4. **Schema additions for your domain** — add tables your scenario needs (e.g. policy documents, runbooks, evaluations). (`schema.sql` + bump version)
5. **Authentication** — required before exposing the app to real users. (Easy Auth or Microsoft Entra ID)
6. **Production hardening** — Key Vault, private networking, OIDC scoping, rate limiting. See [`security.md`](security.md).

## Worked examples

Two illustrative scenarios showing how the customization knobs compose into a real product. The strings here are examples, not prescriptions — pick what fits your domain.

### Scenario A — Internal HR policy assistant

```bash
APP_NAME="ACME HR Assistant"
AI_SYSTEM_PROMPT="You are an HR assistant for ACME staff. Answer questions about leave, benefits, and policies using the provided context. If you are not sure, say so and point the user to the HR portal."
AI_PROVIDER=azure_openai
AI_MODEL=gpt-4.1-mini
```

- Starter prompts (`frontend/src/components/ChatLayout.tsx`): "How many vacation days do I have?", "What's the parental leave policy?", "When is open enrollment?", "How do I expense a business trip?"
- Branding (`frontend/src/styles/global.css`): set `--color-primary` to ACME's brand color.
- Auth: **mandatory** — wire Easy Auth + Microsoft Entra ID so only ACME staff can access (see [Adding authentication](#adding-authentication) below).
- Schema: add a `policy_documents` table (id, title, body, last_reviewed_at) plus an `embeddings` column once you adopt `pgvector` (see [`follow-ups.md#2-add-pgvector-from-day-one`](follow-ups.md#2-add-pgvector-from-day-one)) for retrieval.

### Scenario B — DevOps troubleshooter

```bash
APP_NAME="DevOps Copilot"
AI_SYSTEM_PROMPT="You are a senior Azure DevOps engineer. Help diagnose deployment, networking, and observability issues. When the user pastes an error, identify the most likely cause first and suggest the next diagnostic command."
AI_PROVIDER=azure_openai
AI_MODEL=gpt-4.1-mini
```

- Starter prompts: "Why is my Container App returning ErrImagePull?", "How do I read Postgres slow-query logs in Log Analytics?", "Explain `subject claim does not match` in GitHub OIDC.", "Show me a Kusto query to find 5xx spikes in the last hour."
- Branding: keep the default theme or use a darker palette.
- Auth: optional — Easy Auth + Entra if internal-only, or skip if running in a corp VPN-only environment.
- Schema: optional — add a `runbook_links` table mapping error patterns to internal documentation.

## Branding

- Colours: `frontend/src/styles/global.css` — change CSS variables under `:root`.
- App title: `frontend/index.html` (`<title>`) and the value returned by `GET /api/config` (driven by the `APP_NAME` env var).
- Sidebar header: `frontend/src/components/ChatSidebar.tsx` (`<header>`).

## System prompt

- Default for new chats: `AI_SYSTEM_PROMPT` env var (set via Terraform variable `ai_system_prompt`).
- Per-chat override: persisted in `chats.system_prompt`. Pass `systemPrompt` when creating a chat or update it via `PATCH /api/chats/:id`.

## Adding a new AI provider

1. Implement the `AIProvider` interface in `backend/src/services/ai/<yourProvider>.ts`.
2. Register it in `backend/src/services/ai/aiClient.ts` under a new `case` in the switch.
3. Extend the `AIProviderName` type in `backend/src/config.ts` and the validation in `infra/variables.tf` (the `ai_provider` `validation` block).
4. If your provider needs new env vars, add them to:
   - `backend/src/config.ts`
   - `backend/.env.example`
   - The backend Container App env block in `infra/modules/container-apps/main.tf`
   - The README provider table.

## Changing the database schema

1. Edit `backend/src/db/schema.sql` to add the new DDL using `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` so it stays idempotent.
2. Bump `SCHEMA_VERSION` in `backend/src/db/migrations.ts`. The runner skips already-applied versions, so the new version triggers another pass.
3. Update query helpers in `backend/src/db/queries.ts` and the API types in `backend/src/types/api.ts`.

For larger changes, replace the single-file schema with a proper migration tool (`node-pg-migrate`, `Atlas`, `Sqitch` etc.). The current setup is intentionally minimal.

## Adding authentication

The simplest production path is **Azure Container Apps built-in auth** (Easy Auth):

1. Configure the auth provider on the frontend Container App via the portal or `azurerm_container_app` `authentication` settings.
2. The frontend container will receive `X-MS-CLIENT-PRINCIPAL` headers; forward them through Nginx (`proxy_set_header X-MS-CLIENT-PRINCIPAL $http_x_ms_client_principal;`).
3. In the backend, decode the principal in `backend/src/middleware/authPlaceholder.ts`, populate `req.user`, and persist `app_users.external_subject` on first login.

Alternative: validate JWTs from Microsoft Entra ID directly in the backend with `@azure/msal-node` or `passport-azure-ad`.

## Switching the backend to Python/FastAPI

The default backend is Node.js because `pg` plus a pure-JS stack makes the Docker build trivial. If you prefer Python:

1. Replace `backend/` with a FastAPI app. `Azure-Samples/openai-chat-backend-fastapi` is a good starting point.
2. Use `asyncpg` or `psycopg[binary]` for Postgres. Both work cleanly against Azure Postgres Flexible Server with `sslmode=require`.
3. Keep the same API contract (`/api/...`) so the frontend Nginx proxy and React client need no changes.
4. Update `backend/Dockerfile` and the backend health check.

## Scaling from dev to production

| Knob | Dev | Suggested prod baseline |
| --- | --- | --- |
| `frontend_min_replicas` | 0 | 1+ |
| `backend_min_replicas` | 1 | 2+ |
| `frontend_max_replicas` / `backend_max_replicas` | 1 | 5+ |
| `backend_cpu` / `backend_memory` | 0.25 / 0.5Gi | 0.5 / 1Gi |
| `postgres_sku_name` | `B_Standard_B1ms` | `GP_Standard_D2s_v3` or higher |
| `postgres_storage_mb` | 32768 | 65536+ |
| `postgres_backup_retention_days` | 7 | 14–35 |
| `allow_azure_services_to_sql` | true | false (use private endpoints) |
| `enable_key_vault` | false | true |
| `enable_private_networking` | false | true |
| Authentication | placeholder | Easy Auth or Entra |
| Log Analytics retention | 30 days | per compliance |

## See also

- [`architecture.md`](architecture.md) — how the pieces fit together (request flow, data flow, frontend proxy rationale).
- [`security.md`](security.md) — threat model and the production hardening checklist that complements step 6 above.
- [`follow-ups.md`](follow-ups.md) — prioritized refactors that are out of scope for a basic fork (managed identity for Postgres, `pgvector`, real migration runner, typed query builder, ACR-side image builds).
- [`../AGENTS.md`](../AGENTS.md) — file:line map of every customization seam, optimized for AI coding tools.
