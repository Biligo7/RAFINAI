# Operations

## Deployment

- **GitHub Actions**: push to `main` or run the **Deploy** workflow manually. `deploy.yml` orchestrates `deploy-infra.yml` → `deploy-backend.yml` → `deploy-frontend.yml`. Each child can also be run independently from the Actions tab (and a commented `push:` trigger in each file lets you opt into per-folder auto-deploys).
- **Local**: see the README — bootstrap `terraform apply`, then `./scripts/build-and-push.sh`, then `az containerapp update --image=...` for each service. (Terraform's `ignore_changes` on the Container Apps means a second `terraform apply` won't swap images.)

## Rollback

Container App revisions are immutable. To roll back to a previous Git SHA:

```bash
RG=$(terraform -chdir=infra output -raw resource_group_name)
ACR_LS=$(terraform -chdir=infra output -raw acr_login_server)
BACKEND=$(terraform -chdir=infra output -raw backend_container_app_name)
FRONTEND=$(terraform -chdir=infra output -raw frontend_container_app_name)
SHA=<previous-sha>

az containerapp update --name "$BACKEND"  --resource-group "$RG" --image "$ACR_LS/backend:$SHA"
az containerapp update --name "$FRONTEND" --resource-group "$RG" --image "$ACR_LS/frontend:$SHA"
```

The `:latest` tag also exists in ACR but using a SHA is more deterministic.

For emergency rollback through the portal: open the Container App → Revisions → activate a previous revision and route 100% traffic to it.

## Reading logs

```kusto
// Backend application logs (last 100 lines)
ContainerAppConsoleLogs_CL
| where ContainerAppName_s contains "backend"
| order by TimeGenerated desc
| take 100
```

```kusto
// System events: image pulls, crashes, scale operations
ContainerAppSystemLogs_CL
| where ContainerAppName_s contains "backend"
| where Log_s has_any ("Error", "ErrImagePull", "ContainerCrashing")
| order by TimeGenerated desc
```

```kusto
// Latency histogram from chat.completion.completed events
ContainerAppConsoleLogs_CL
| where Log_s has "chat.completion.completed"
| extend parsed = parse_json(Log_s)
| summarize count(), avg(toint(parsed.latencyMs)) by bin(TimeGenerated, 15m)
```

## Database migrations

- Default behaviour: the backend runs migrations on startup if `RUN_MIGRATIONS_ON_STARTUP=true` (default). The runner is idempotent and gated on the `schema_migrations` table.
- Manual run: `cd backend && npm run db:migrate` (uses the same env vars).
- Disable the in-process runner and run a one-shot job in CI by setting `RUN_MIGRATIONS_ON_STARTUP=false`, then invoking `npm run db:migrate` from a job container in your pipeline.

## Backup and restore

Azure Database for PostgreSQL Flexible Server includes automated backups by default:

- **Point-in-time restore**: 7–35 days of full + transaction-log backups (`postgres_backup_retention_days` controls retention; default 7).
- **Geo-redundant backups** are off by default. Set `postgres_geo_redundant_backup_enabled = true` to replicate backups to the paired region.

Restoration creates a new Flexible Server from a chosen restore point: portal → server → Restore, or `az postgres flexible-server restore`. Update `PG_HOST` (and the corresponding TF var if you adopt the new server in Terraform) and redeploy.

For schema-only or selective restores, take logical dumps with `pg_dump` and restore with `pg_restore`.

## Cost controls

- Both Container Apps default to `min_replicas=0`. Idle cost is dominated by the storage account holding Terraform state + the always-on Postgres B1ms instance (~$12-15/mo).
- Postgres Burstable B1ms does not auto-stop. If idle cost matters more than first-request latency, run `az postgres flexible-server stop` between sessions, or move to a General Purpose tier with auto-stop enabled.
- Log Analytics is billed per GB ingested. Watch retention and the `enable_custom_log_ingestion` flag.
- ACR Basic SKU has the lowest per-day cost. Move to Standard/Premium only if you need geo-replication, content trust, or larger storage.

## Custom log ingestion (off by default)

When `enable_custom_log_ingestion = true`, Terraform creates:

- A Data Collection Endpoint (`dce-...`)
- A Data Collection Rule (`dcr-...`) targeting a custom table `AiAppEvents_CL`
- The custom table itself with columns `TimeGenerated`, `RequestId`, `EventType`, `Severity`, `Message`, `PropertiesJson`

To wire the backend up:

1. Create a system-assigned identity on the backend Container App (add `identity { type = "SystemAssigned" }` to the resource).
2. Grant the identity the `Monitoring Metrics Publisher` role on the DCR.
3. Use the `@azure/identity` + `@azure/monitor-ingestion` packages in `services/telemetryService.ts` to POST events to the DCE.

This is intentionally not enabled in the default backend because the wiring adds dependencies and complexity. Container Apps console logs (which include the same structured events) flow into Log Analytics for free.

## See also

- [`troubleshooting.md`](troubleshooting.md) — symptom / cause / fix for deploy and runtime issues.
- [`security.md`](security.md) — production hardening checklist (Key Vault, private networking, OIDC scoping, rate limiting).
- [`follow-ups.md`](follow-ups.md) — managed identity for Postgres, `pgvector`, a real migration runner, ACR-side image builds.
