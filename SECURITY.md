# Security Considerations

This repository is published as a **template** under the MIT license (see [`LICENSE`](LICENSE)). The defaults are tuned for low cost and easy first-time setup, **not** for production exposure to untrusted users.

Notable defaults you should review before deploying publicly:

- Authentication is a placeholder (`AUTH_ENABLED=false` by default).
- Postgres Flexible Server has `allow_azure_services_to_sql=true` (broad Azure-origin firewall rule).
- The Terraform state contains the Postgres admin password and any provider API keys passed via `TF_VAR_*`.
- Container Apps default to `min_replicas=0` (cold starts, but no idle compute cost).
- The default AI provider is `mock` so the chat works with no credentials; this is visible at `/api/config`.

## Local developer setup

The first-time setup in [`README.md`](README.md) (§1–§3) signs you into Azure and GitHub on the developer machine and creates long-lived artefacts in your tenant. Before running the bootstrap scripts on a shared or long-lived workstation:

- `az login` caches Azure access/refresh tokens under `~/.azure/`. They are bearer credentials for every subscription the signed-in user can reach. End the session with `az logout` (or `az account clear`) when you are done on a shared machine.
- `gh auth login` caches a GitHub token under `~/.config/gh/`. The default scopes (`repo`, `read:org`, `workflow`, `gist`) are what the bootstrap scripts need — do not grant broader scopes unless something else requires them. Revoke with `gh auth logout` or from **GitHub → Settings → Applications**.
- [`scripts/bootstrap-azure-oidc.sh`](scripts/bootstrap-azure-oidc.sh) creates a Microsoft Entra application + service principal in your tenant. By default it assigns **Contributor at subscription scope**; `--also-grant-uaa` additionally assigns **User Access Administrator at subscription scope** (needed so Terraform can create the `AcrPull` role assignment). For first deploys, prefer `--scope resource-group --resource-group <rg>` and grant UAA at that narrower scope. When you tear the environment down, delete the app registration with `az ad app delete --id <appId>` — `terraform destroy` does not remove it.
- The federated credential issued by the script is bound to `repo:<owner>/<repo>:environment:<environment>`. Re-run the script per environment (`dev`, `prod`) rather than reusing one credential, and remove credentials pointing at repos you no longer own.
- [`scripts/bootstrap-tf-state.sh`](scripts/bootstrap-tf-state.sh) creates the Terraform state storage account with `--allow-blob-public-access false` and writes `infra/backend.hcl` locally (gitignored). The state holds the Postgres admin password and any provider API keys — restrict RBAC on the storage account to the deploy service principal plus a small operator group. See [`docs/security.md#terraform-state-sensitivity`](docs/security.md#terraform-state-sensitivity).
- `--set-secrets` / `--set-vars` write to GitHub environment secrets and variables. These are **long-lived until rotated**, and anyone who can land a workflow change that uses the `dev`/`prod` environment can exfiltrate them. Audit repo collaborators and require manual approval on the `prod` environment — see [`docs/follow-ups.md`](docs/follow-ups.md#6-restrict-the-github-oidc-subject-to-a-protected-environment).
- `.env`: only `.env.example` is checked in (`AI_PROVIDER=mock` by default). [`scripts/run-local.sh`](scripts/run-local.sh) copies it to `.env` on first run. If you populate `.env` with real API keys, it is gitignored but sits on disk in cleartext — rotate any keys that may have leaked via logs, screenshots, or screen-shares.

See [`docs/security.md`](docs/security.md) for the full threat model and the production hardening checklist, and [`docs/follow-ups.md`](docs/follow-ups.md) for prioritized security-relevant improvements (managed identity for Postgres, OIDC subject scoping for prod, etc.).
