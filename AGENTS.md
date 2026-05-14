# Project map for AI coding assistants

This file is an entry point for AI coding tools (Claude Code, Cursor, Copilot, etc.) working on this repo. Humans should start at [`README.md`](README.md).

## What this is

A production-shaped, cheap-by-default Azure deployment of a ChatGPT-style chat application, structured as a template. Forks customize the system prompt, branding, AI provider, and (optionally) database schema and authentication, then deploy to Azure with Terraform + GitHub Actions.

## Stack at a glance

| Layer | Tech | Location |
| --- | --- | --- |
| Backend | Node.js 20, Express, TypeScript (strict), Pino, `pg`, `openai` SDK | `backend/` |
| Frontend | React, Vite, Nginx (reverse proxy at runtime) | `frontend/` |
| Database | PostgreSQL (in-memory fallback when `PG_*` env vars are unset) | `backend/src/db/` |
| Infra | Terraform → Azure Container Apps + Postgres Flexible Server + ACR + Log Analytics | `infra/` |
| CI/CD | GitHub Actions over OIDC (no stored Azure credentials) | `.github/workflows/` |
| Local dev | `docker compose` (Postgres + backend + frontend with mock AI) | `docker-compose.yml` |

## Customization touchpoints

The most common edits, in the order most forks make them:

| What | Where | How |
| --- | --- | --- |
| System prompt | `backend/src/config.ts:86` | Set `AI_SYSTEM_PROMPT` env var (Terraform variable: `ai_system_prompt`) |
| AI provider | `backend/src/services/ai/aiClient.ts:25` | Set `AI_PROVIDER` to `mock`, `azure_openai`, or `openai_compatible` |
| Add a new provider | new `backend/src/services/ai/<name>.ts` | Implement the `AIProvider` interface in `aiClient.ts:6`, register a `case` in the switch, extend `AIProviderName` in `backend/src/config.ts:3`, extend the validation in `infra/variables.tf` |
| Branding (CSS variables) | `frontend/src/styles/global.css:2-24` | Edit `:root` variables (`--color-primary`, `--color-sidebar`, etc.) |
| App name / title | env `APP_NAME` + `frontend/index.html` `<title>` | `APP_NAME` flows to `/api/config` and is rendered in the sidebar header (`frontend/src/components/ChatSidebar.tsx`) and the main header (`frontend/src/components/ChatLayout.tsx:134`) |
| Starter prompts | `frontend/src/components/ChatLayout.tsx:13` | Edit the `STARTER_PROMPTS` array |
| DB schema | `backend/src/db/schema.sql` | Add idempotent DDL (`CREATE ... IF NOT EXISTS`) and bump `SCHEMA_VERSION` in `backend/src/db/migrations.ts:7` |
| Auth seam | `backend/src/middleware/authPlaceholder.ts` | No-op when `AUTH_ENABLED=false`. See `docs/customization.md` for Easy Auth / Entra wiring |
| Terraform inputs | `infra/variables.tf` | Cost/scale knobs, feature flags (Key Vault, private networking, Azure OpenAI provisioning, custom log ingestion) |

## Conventions to follow

- **TypeScript strict** in both `backend/` and `frontend/`. Lint = `npm run lint` (which runs `tsc --noEmit`). Tests = `npm test` (Vitest).
- **Idempotent SQL.** All DDL uses `CREATE ... IF NOT EXISTS`. After adding to `schema.sql`, bump `SCHEMA_VERSION` so the runner re-applies on the next start.
- **Provider secrets stay backend-only.** `/api/config` returns only safe values (`appName`, `environment`, `aiProvider`, `model`, flags). Never add a credential to that response.
- **Terraform.** Run `terraform fmt -recursive` in `infra/` before committing. Sensitive values (`sql_admin_password`, provider API keys) are passed via `TF_VAR_*` env vars, never hardcoded.
- **Keep dependencies minimal.** See `CONTRIBUTING.md`.
- **One concern per pull request.** Update `README.md` and `docs/` when behavior or interfaces change.

## Common tasks

```bash
# Local dev (mock AI, in-memory DB optional via env)
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
docker compose up --build
# → http://localhost:8080

# Backend tests
cd backend && npm test

# Build & push images to ACR (after first terraform apply created the registry)
./scripts/build-and-push.sh

# Smoke test a deployed app
./scripts/smoke-test.sh --url "$(terraform -chdir=infra output -raw frontend_url)"

# Export training examples as JSONL (for fine-tuning pipelines)
./scripts/export-training-jsonl.sh --base-url http://localhost:8080 > examples.jsonl
```

## Where to read more

| Doc | Purpose |
| --- | --- |
| [`README.md`](README.md) | Quickstart, deploy flow, cost knobs, AI provider configuration |
| [`docs/architecture.md`](docs/architecture.md) | Component diagram, request flow, data flow, logging flow |
| [`docs/customization.md`](docs/customization.md) | Branding, system prompt, provider, schema, authentication |
| [`docs/operations.md`](docs/operations.md) | Rollback, migrations, backup/restore, log queries, cost controls |
| [`docs/security.md`](docs/security.md) | Threat model + production hardening checklist |
| [`docs/troubleshooting.md`](docs/troubleshooting.md) | Symptom / cause / fix for common issues |
| [`docs/upstream-templates.md`](docs/upstream-templates.md) | Related Microsoft samples; why this template doesn't depend on `azd` |
| [`docs/follow-ups.md`](docs/follow-ups.md) | Prioritized improvements (managed identity for Postgres, `pgvector`, real migration runner, query builder, ACR-side image builds, OIDC subject scoping, optional `azd` integration) |
| [`infra/README.md`](infra/README.md) | Terraform module overview |
