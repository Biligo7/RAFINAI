# Troubleshooting

## Container app stuck in provisioning

**Symptom**: `terraform apply` hangs or `azurerm_container_app` shows `Provisioning` for several minutes.

**Causes**:
- ACR pull failure on the very first apply (see "ACR pull errors" below).
- The user-assigned managed identity hasn't propagated yet — Azure RBAC can take a minute to settle.

**Fixes**:
- The first Terraform apply uses `use_bootstrap_images = true` by default and creates the Container Apps with a public hello-world image. If you've changed that default, switch it back.
- Re-run `terraform apply`. Idempotent.
- Image and target port are owned by `deploy-backend.yml` / `deploy-frontend.yml` (or local `az containerapp update`) — Terraform has `ignore_changes` set on those fields, so it won't revert them.

## ACR pull errors (`ErrImagePull`, `ImagePullBackOff`)

**Symptom**: `ContainerAppSystemLogs_CL` shows `ErrImagePull` for `aca-aichat-backend-*` or `aca-aichat-frontend-*`.

**Causes**:
- The image tag does not exist in ACR. Common when `az containerapp update --image=...` ran before the build/push step.
- The user-assigned identity does not have `AcrPull` on the registry. Terraform creates this assignment but it can take 30–60s to propagate.

**Fixes**:
1. Confirm the tag exists: `az acr repository show-tags --name <acrName> --repository backend`.
2. If missing, build/push: `./scripts/build-and-push.sh`.
3. Check the role assignment: `az role assignment list --assignee <identity-principal-id> --scope <acrId>`.

## Backend cannot reach Postgres

**Symptom**: `/readyz` returns 503; backend logs show `Postgres connect failed` with `ETIMEDOUT`, `ECONNREFUSED`, `28P01` (auth), or TLS errors.

**Causes**:
1. The Postgres server has been stopped manually (`az postgres flexible-server stop`) and a request landed before it was started again.
2. `allow_azure_services_to_sql = false` and the Container Apps egress IPs are not listed.
3. `PG_SSL` mismatch — Azure Postgres Flexible Server requires TLS.
4. Wrong `PG_USER` or password — on Flexible Server the admin login is the bare username (no `@servername` suffix that single-server required).

**Fixes**:
- Wait and retry: the backend retries 6 times with exponential backoff during startup. The Burstable B1ms tier is normally always-on, so persistent connect failures usually point at config rather than a wake-up delay.
- For locked-down setups, list the Container Apps Environment outbound IP in `allowed_sql_client_ips`, or move to private networking.
- In Azure deployments `PG_SSL` must be `true`. The Terraform module sets this for you.

## Slow first request after a deploy

Postgres Flexible Server (Burstable B1ms) is always-on, so there's no DB cold-start. The backend defaults to `backend_min_replicas = 1` to avoid 504s on the first request, but the frontend defaults to 0. Mitigations:

- `frontend_min_replicas = 1` to remove the Nginx cold start too.
- If you've explicitly set `backend_min_replicas = 0`, revert it — the first `/api/*` after idle will likely 504 because the Python + Postgres boot exceeds the Container Apps edge timeout.
- Surface a friendly "warming up" message in the UI for the first request after a deploy.

## Frontend 502 when proxying `/api/*`

**Symptom**: Browser shows `502 Bad Gateway` from the frontend; `/healthz` works.

**Causes**:
- The backend is scaled to zero and starting up. The Nginx default `proxy_connect_timeout` is short.
- `BACKEND_BASE_URL` does not resolve. Common if you renamed the backend Container App.

**Fixes**:
- Wait for the backend to come up. With `min_replicas=1` this is a non-issue.
- Verify `BACKEND_BASE_URL` on the frontend Container App equals `http://aca-aichat-backend-<env>` (no trailing slash).
- Container Apps service discovery resolves names only inside the same environment. Both apps must share the environment.

## SSE streaming buffered or not working

**Symptom**: tokens arrive in batches at the end of the response instead of one-by-one.

**Causes**:
- Nginx `proxy_buffering` enabled (default `on`).
- A CDN/Front Door in front of the app buffering responses.
- A browser extension reading the response.

**Fixes**:
- The shipped `nginx.conf.template` already sets `proxy_buffering off; proxy_cache off;` in the `/api/` block. Don't remove those.
- If you add Azure Front Door, configure it to allow streaming responses (or skip caching for `/api/*`).

## Azure OpenAI 401 / 403 / 404

| Status | Likely cause |
| --- | --- |
| 401 | `AZURE_OPENAI_API_KEY` is wrong or empty. |
| 403 | The key is valid but you don't have access to the deployment (RBAC / region). |
| 404 | `AZURE_OPENAI_DEPLOYMENT` does not exist on the endpoint, or the API version is too old. |

The backend logs the provider name, model, and request id on each call. Copy the request id into Log Analytics to find the offending log line.

## Terraform state lock

**Symptom**: `Error acquiring the state lock`.

**Causes**:
- A previous apply was killed without releasing the lock.
- Two CI runs racing.

**Fixes**:
- `terraform force-unlock <lock-id>` after confirming nothing is actually running.
- Add concurrency control in GitHub Actions (`concurrency: group: deploy-${{ matrix.env }}`).

## GitHub OIDC subject mismatch

**Symptom**: `azure/login@v2` fails with `AADSTS70021` or `subject claim does not match`.

**Causes**:
- The federated credential subject does not match what the workflow sends. The workflow sends `repo:tachyontec/azure-ai-chat-template:environment:<env>` only if the job has an `environment:` block.

**Fixes**:
- Make sure the workflow job has `environment: dev` (or `prod`).
- Confirm the federated credential subject equals `repo:tachyontec/azure-ai-chat-template:environment:dev`.
- For branch-scoped subjects you'd need `repo:tachyontec/azure-ai-chat-template:ref:refs/heads/main` and a workflow without `environment:`.

The `bootstrap-azure-oidc.sh` script defaults to environment-scoped credentials; pass `--environment prod` for a second one.

## See also

- [`architecture.md`](architecture.md) — request flow and the frontend-proxy rationale (helps you reason about 502s and SSE buffering).
- [`operations.md`](operations.md) — Kusto queries you can paste into Log Analytics while diagnosing.
- [`security.md`](security.md) — relevant when an issue traces back to a default tradeoff (firewall rule, OIDC scope).
