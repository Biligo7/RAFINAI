# Follow-up improvements

Recommendations that came out of the Postgres migration discussion. None of these are required for the template to work — they're listed in priority order so you can pick them up when relevant. Each one references the files that would change so you (or a future contributor) can scope the work without re-deriving context.

## 1. Use Managed Identity for Postgres auth instead of a password

**Why.** The Postgres admin password lives in the Terraform state and in the Container App secret store. Managed Identity (Microsoft Entra auth on Azure Postgres Flexible Server) removes both copies — the backend container requests a short-lived token at connect time and never sees the password.

**What to change.**

- `infra/modules/sql/main.tf` — add an `azurerm_postgresql_flexible_server_active_directory_administrator` resource pointing at the backend Container App's user-assigned identity. Drop `administrator_password` once you no longer need a fallback.
- `infra/modules/container-apps/main.tf` — add a system-assigned or user-assigned identity to the backend Container App. Pass the identity's principal id back up to the SQL module so it can be granted as the AAD admin.
- `backend/src/db/pool.ts` — swap the static password for `@azure/identity` `DefaultAzureCredential` and request a token with scope `https://ossrdbms-aad.database.windows.net/.default`. Inject the token as the password at connect time and refresh on token expiry (~1 hour).
- Drop `PG_PASSWORD` and `TF_VAR_sql_admin_password` from the deploy workflow.

**Cost.** Free.

**Risk.** Local development needs a workaround — the Postgres docker container doesn't speak AAD. Keep password auth as a fallback when `PG_PASSWORD` is set; only switch to token auth when running in Azure (detect via `IDENTITY_ENDPOINT` or `MSI_ENDPOINT` env var).

## 2. Add `pgvector` from day one

**Why.** Almost any "next feature" for a chat app — semantic memory, RAG over user docs, deduplicating training examples — wants a vector store. Enabling `pgvector` upfront is one Terraform line; retrofitting it later means a separate vector DB or a schema-migration round-trip.

**What to change.**

- `infra/modules/sql/main.tf` — add an `azurerm_postgresql_flexible_server_configuration` resource with `name = "azure.extensions"` and `value = "VECTOR"` (or `"VECTOR,PG_TRGM"` if you also want trigram search). Azure Postgres only allows extensions on its allow-list; `vector` is on it.
- `backend/src/db/schema.sql` — add `CREATE EXTENSION IF NOT EXISTS vector;` near the top, alongside `pgcrypto`.
- Add a sketch table when you actually need it, e.g. `CREATE TABLE message_embeddings (message_id uuid PRIMARY KEY REFERENCES messages(id), embedding vector(1536));`. No need to add this until something writes to it.

**Cost.** Free.

**Risk.** Low. The extension itself adds no overhead until you create a `vector` column.

## 3. Add a real migration runner

**Why.** The current `migrations.ts` just re-applies a single `schema.sql` file using `IF NOT EXISTS` guards. The `schema_migrations` table exists but is gated on a single hardcoded version string (`001_initial`). Adding a real migration the way the code is structured today means bumping that string and editing the schema in place — fine for a template but it loses history and makes rollback ad hoc.

**What to change.**

- Pick a tool: `node-pg-migrate` (small, SQL-file-based) or a lightweight homegrown loader that reads `migrations/*.sql` in order. Either works.
- Move `schema.sql` content into `migrations/001_initial.sql`. Add new migrations as `migrations/00X_<name>.sql`.
- Update `migrate-cli.ts` to invoke the runner instead of `runMigrations()`.
- Keep the in-process startup runner; just point it at the new loader.

**Cost.** Free.

**Risk.** Low. Most of the work is mechanical — moving SQL into numbered files and writing a loop that applies un-applied versions in order.

## 4. Adopt a typed query builder (Drizzle or Kysely)

**Why.** `backend/src/db/queries.ts` is hand-rolled SQL with manual row-type interfaces. That's fine at this size but every new column means editing three places (schema, row type, mapper). A typed query builder gives:

- Compile-time errors when you reference a column that doesn't exist.
- A single source of truth for table types, derived from the schema.
- Free migration generation (Drizzle Kit) if you adopt their migration tool too.

**Which one.**

- **Drizzle** — closer to SQL, smaller learning curve, ships migration tooling (`drizzle-kit`). Good fit if you also adopt #3 above using their generator.
- **Kysely** — pure query builder, no opinions about migrations. Good if you want to keep raw SQL files but get type safety on selects.

**What to change.**

- Add the chosen library to `backend/package.json`.
- Define table schemas once (Drizzle: `pgTable(...)` in TS; Kysely: an `interface DB { ... }`).
- Rewrite `queries.ts` to use the builder. The function shapes stay the same so `repository.ts` doesn't change.
- Keep `pg` underneath both — they're drivers, not replacements.

**Cost.** Free.

**Risk.** Medium. The diff touches every query in the file; tests should catch regressions but allocate a focused session for it.

## 5. Build images on Azure Container Registry instead of GitHub Actions runners

**Why.** Today `scripts/build-and-push.sh` and the deploy workflow build images on the GitHub runner and push them to ACR. ACR Tasks (`az acr build`) builds *inside* Azure on the registry side, which is faster on cold runners and avoids pulling base images across the public internet. Same `Dockerfile` works.

**What to change.**

- `scripts/build-and-push.sh` — replace `docker build` + `docker push` with `az acr build --registry <acr> --image backend:<tag> backend/` and likewise for frontend.
- `.github/workflows/deploy.yml` — drop the Docker buildx setup steps; the OIDC login step is enough since `az acr build` runs server-side.

**Cost.** Free (ACR Basic includes ACR Tasks).

**Risk.** Low. The builds are deterministic; only the build location changes.

## 6. Restrict the GitHub OIDC subject to a protected environment

**Why.** `bootstrap-azure-oidc.sh` defaults to `subject = repo:tachyontec/azure-ai-chat-template:environment:dev`. That's already environment-scoped, but the dev environment has no protection rules by default. For prod, the federated credential should be tied to an environment that requires manual approval.

**What to change.**

- In GitHub: Settings → Environments → prod → add **Required reviewers**. Optionally restrict to specific branches.
- Run `./scripts/bootstrap-azure-oidc.sh --environment prod` to create a second federated credential bound to the prod environment.
- The deploy workflow already supports per-environment runs (`environment: ${{ inputs.environment }}`).

**Cost.** Free.

**Risk.** None — this is purely a security hardening step.

## 7. Optional: add Azure Developer CLI (`azd`) support

**Why.** The Azure-Samples gallery convention is that templates ship an `azure.yaml` so users can run `azd up` to provision and deploy in one command. Adding it lowers the barrier for newcomers who already use `azd` and makes this template easier to list as an "official Azure AI template". It coexists with the current Terraform + GitHub Actions flow rather than replacing it.

**What to change.**

- Add `azure.yaml` at the repo root declaring the `infra/` directory, the `frontend` and `backend` services, their Dockerfiles, and pre/post-deploy hooks.
- Add an `infra/main.tf`-aware azd hook (azd's Terraform provider support is in preview), or wrap `terraform apply` in `hooks/preprovision.sh` / `hooks/postprovision.sh`.
- Document the trade-off in `docs/upstream-templates.md`: azd users get `azd up`, plain-Terraform users keep the current workflow.

**Cost.** Free.

**Risk.** Low. The two flows are independent — keeping the existing GitHub Actions deploy workflow as the primary path means breaking changes in azd don't block deployments.

## 8. Add a frontend test scaffold

**Why.** The backend has Vitest tests (`backend/src/tests/*.test.ts`). The frontend has none — no `test` script in `frontend/package.json`, no Vitest config, no test files. For a template, even one render test of `<ChatLayout/>` against a mocked `/api/config` response prevents the most common regression: a broken bundle shipping past green CI because nothing exercised the UI tree.

**What to change.**

- `frontend/package.json` — add `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom` to `devDependencies`; add `"test": "vitest run"` and `"test:watch": "vitest"` to `scripts`.
- `frontend/vitest.config.ts` (new) — `environment: 'jsdom'`, point `setupFiles` at a small helper that imports `@testing-library/jest-dom`.
- `frontend/src/components/__tests__/ChatLayout.test.tsx` (new) — render `<ChatLayout/>` with a mocked `fetch` returning a fake `/api/config`; assert the empty-state heading and at least one starter prompt button render.
- `.github/workflows/ci.yml` — add a `cd frontend && npm test` step alongside the existing backend test step.

**Cost.** Free.

**Risk.** Low. Doesn't affect runtime. CI gains one job (~30s).

## Notes that turned out to be wrong

For the record, two suggestions from the original list did not survive verification and were dropped:

- **"`/readyz` doesn't actually ping the DB."** It does — `backend/src/routes/health.ts` runs `SELECT 1`. The route was correct before and after the Postgres migration.
- **"`@types/mssql` gap is upstream-broken."** It was real, but became moot when `mssql` was replaced by `pg` (which ships proper types via `@types/pg`).
