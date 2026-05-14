# Terraform — Azure AI Chat Template

This directory provisions the Azure resources for the template:

- Resource Group
- Log Analytics Workspace
- Azure Container Registry (Basic, admin disabled)
- User-assigned managed identity + `AcrPull` role assignment
- Container Apps Environment + frontend/backend Container Apps
- Azure Database for PostgreSQL Flexible Server + database

## Quick start

The backend declaration lives in committed `backend.tf` (empty `backend "azurerm" {}` block). Values are supplied at init time. Run `scripts/bootstrap-tf-state.sh` once to provision the state storage and write `backend.hcl` (gitignored).

```bash
terraform init -backend-config=backend.hcl
terraform apply -var="use_bootstrap_images=true"
```

If you didn't run the bootstrap script, pass `-backend-config="key=value"` flags directly to `terraform init` (one per setting: `resource_group_name`, `storage_account_name`, `container_name`, `key`).

After your first apply, build and push images, then swap the live images with `az containerapp update` — see the README's Stage 3 section. **Do not** `terraform apply` to update image tags: `azurerm_container_app.{frontend,backend}` have `lifecycle.ignore_changes` set on `image` and `target_port`, so Terraform will silently ignore those vars after the initial create. The per-service GitHub workflows (`deploy-backend.yml`, `deploy-frontend.yml`) own those fields.

The bootstrap step exists because the Container Apps need a valid image reference at create time, but ACR has no images on the very first apply. The bootstrap image is a public hello-world container that comes up cleanly so the rest of the stack can stabilise.

## Modules

| Module | What it owns |
| --- | --- |
| `modules/acr` | Azure Container Registry. Admin disabled by default. |
| `modules/container-apps` | Environment + both Container Apps + revision + secrets. |
| `modules/log-analytics` | Workspace used by the Container Apps Environment. |
| `modules/sql` | Postgres Flexible Server, database, firewall rules. |
| `modules/monitor-custom-logs` | Custom DCR/DCE/table for `AiAppEvents_CL`. Off by default. |

## Cost knobs

See `variables.tf`. Defaults are tuned for the cheapest practical deployment — see the project README for a table.

## Secrets

- The Postgres admin password is supplied by the operator via `TF_VAR_sql_admin_password` and stored in Terraform state. **Restrict access to the state file.**
- AI provider API keys are passed via `TF_VAR_*` and surfaced as Container App secrets, never plain env vars.
