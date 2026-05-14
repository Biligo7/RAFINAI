# Security

## Threat model summary

| Asset | Threat | Default mitigation |
| --- | --- | --- |
| OpenAI / Azure OpenAI keys | Exfiltration via browser or repo | Backend-only; passed as Container App secrets; never returned by `/api/config` |
| Postgres admin password | Exfiltration via state file | Supplied by operator as a GitHub secret; stored in state — restrict state container access |
| User chat content | Public exposure of internal endpoint | Backend has internal ingress only; reachable only through frontend proxy |
| Build artefacts | Compromise of registry pulls | ACR admin disabled; pulls via user-assigned managed identity with `AcrPull` |
| GitHub OIDC role | Subscription compromise from forked PR | Federated credential bound to environment + repo; PR plan job skips forks |
| Backend → Postgres | Eavesdropping | TLS enforced (`PG_SSL=true` in Azure; Flexible Server requires TLS) |

## Default risks worth knowing

1. `allow_azure_services_to_sql = true` opens Postgres to traffic from any Azure service via the `0.0.0.0` Flexible Server firewall rule. This is dev-friendly but broad. For production, set it to `false` and either:
   - List explicit IPs in `allowed_sql_client_ips`, or
   - Enable private networking and put the Container Apps Environment + Postgres behind a VNet with private endpoints.
2. The Terraform state contains the Postgres admin password (supplied via `TF_VAR_sql_admin_password`) and any provider API keys you pass through `TF_VAR_*`. Keep the state container private (RBAC, no public access).
3. `min_replicas = 0` causes cold starts on the frontend/backend Container Apps. Postgres on Burstable B1ms is always-on, so the DB itself does not contribute to first-request latency.
4. The auth middleware is a placeholder. The chat endpoints are unauthenticated by default. Do not deploy publicly without adding auth (see `customization.md`).
5. The `mock` provider is the default — `/api/config` advertises this. Anyone hitting the public URL will see model: `mock-gpt`. Switch to a real provider before announcing the URL.

## Production hardening checklist

- [ ] Move provider API keys to Key Vault (`enable_key_vault = true`) and have Container Apps reference Key Vault secrets.
- [ ] Set `allow_azure_services_to_sql = false` and use private endpoints for Postgres.
- [ ] Add Container Apps Easy Auth or backend JWT validation for Microsoft Entra ID.
- [ ] Restrict the GitHub OIDC federated credential's `subject` to a specific environment (e.g. `repo:tachyontec/azure-ai-chat-template:environment:prod`) and require manual approval on the prod environment.
- [ ] Add image vulnerability scanning (Defender for Cloud or Trivy in CI).
- [ ] Add per-IP / per-user rate limiting at the frontend Nginx, the backend, or an Azure Front Door / WAF in front.
- [ ] Set Log Analytics retention to your required compliance window.
- [ ] Apply diagnostic settings to ACR, Postgres, and Container Apps for an audit trail beyond the workspace defaults.
- [ ] Restrict Terraform state access to a small group (RBAC on the storage account).
- [ ] Rotate the Postgres admin password (and any provider API keys) on a schedule.

## GitHub OIDC details

The federated credential issued by `bootstrap-azure-oidc.sh` looks like:

```json
{
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "repo:tachyontec/azure-ai-chat-template:environment:dev",
  "audiences": ["api://AzureADTokenExchange"]
}
```

Implications:

- Only workflows that run with `environment: dev` on this repo can request a token for this app.
- A push from a fork **cannot** mint a token, because the OIDC issuer's `repo` claim won't match.
- If you need branch-based scoping instead of environments, use `subject = "repo:tachyontec/azure-ai-chat-template:ref:refs/heads/main"` and adjust the workflows.

## Terraform state sensitivity

The following sensitive values land in state by default:

- `var.sql_admin_password`
- `var.azure_openai_api_key`, `var.openai_api_key` (when set)
- The Log Analytics primary shared key
- The user-assigned identity's principal id (less sensitive but still useful for an attacker)

Practical implications:

- The state container should be private with RBAC restricted to the deploy SP and a small operator group.
- Avoid `terraform output` of sensitive values in CI logs; the workflows here avoid that.
- Consider rotating these secrets if the state file is ever exposed.

## See also

- [`../SECURITY.md`](../SECURITY.md) — top-level summary of the defaults that need review before public exposure.
- [`customization.md#adding-authentication`](customization.md#adding-authentication) — wire Easy Auth or Microsoft Entra ID.
- [`follow-ups.md#1-use-managed-identity-for-postgres-auth-instead-of-a-password`](follow-ups.md#1-use-managed-identity-for-postgres-auth-instead-of-a-password) — remove the Postgres admin password from state.
- [`follow-ups.md#6-restrict-the-github-oidc-subject-to-a-protected-environment`](follow-ups.md#6-restrict-the-github-oidc-subject-to-a-protected-environment) — bind production deploys to a protected environment.
