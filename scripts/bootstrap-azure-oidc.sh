#!/usr/bin/env bash
# Create or reuse a Microsoft Entra application + service principal, assign a
# role, and add a federated credential so GitHub Actions can sign in via OIDC.

set -euo pipefail

usage() {
  cat <<USAGE
Usage: $0 \\
  --subscription-id <id> \\
  --github-owner <owner> \\
  --github-repo <repo> \\
  --app-name <displayName> \\
  [--environment <name>] \\
  [--scope subscription|resource-group] \\
  [--resource-group <rg>] \\
  [--role <roleName>] \\
  [--also-grant-uaa] \\
  [--set-secrets]

Defaults:
  --environment        dev
  --scope              subscription
  --role               Contributor

Federated subject defaults:
  repo:<owner>/<repo>:environment:<environment>

Use --also-grant-uaa to additionally grant "User Access Administrator" so that
Terraform can create role assignments (this stack needs AcrPull on the
Container Apps managed identity). This is required at the chosen scope.

Use --set-secrets to call gh secret set / gh variable set for AZURE_CLIENT_ID,
AZURE_TENANT_ID, AZURE_SUBSCRIPTION_ID. Requires gh CLI authenticated.
USAGE
}

SUBSCRIPTION_ID=""
GH_OWNER=""
GH_REPO=""
APP_NAME=""
ENVIRONMENT="dev"
SCOPE_KIND="subscription"
RG=""
ROLE="Owner" # Contributor + Create role assignments
ALSO_UAA="false"
SET_SECRETS="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --subscription-id) SUBSCRIPTION_ID="$2"; shift 2 ;;
    --github-owner) GH_OWNER="$2"; shift 2 ;;
    --github-repo) GH_REPO="$2"; shift 2 ;;
    --app-name) APP_NAME="$2"; shift 2 ;;
    --environment) ENVIRONMENT="$2"; shift 2 ;;
    --scope) SCOPE_KIND="$2"; shift 2 ;;
    --resource-group) RG="$2"; shift 2 ;;
    --role) ROLE="$2"; shift 2 ;;
    --also-grant-uaa) ALSO_UAA="true"; shift ;;
    --set-secrets) SET_SECRETS="true"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown flag: $1" >&2; usage; exit 1 ;;
  esac
done

if [[ -z "$SUBSCRIPTION_ID" || -z "$GH_OWNER" || -z "$GH_REPO" || -z "$APP_NAME" ]]; then
  usage
  exit 1
fi

if [[ "$SCOPE_KIND" == "resource-group" && -z "$RG" ]]; then
  echo "--scope resource-group requires --resource-group" >&2
  exit 1
fi

echo "==> Setting subscription $SUBSCRIPTION_ID"
az account set --subscription "$SUBSCRIPTION_ID"
TENANT_ID=$(az account show --query tenantId -o tsv)

echo "==> Ensuring app registration '$APP_NAME' exists"
APP_ID=$(az ad app list --display-name "$APP_NAME" --query "[0].appId" -o tsv)
if [[ -z "$APP_ID" || "$APP_ID" == "null" ]]; then
  APP_ID=$(az ad app create --display-name "$APP_NAME" --query appId -o tsv)
  echo "    created app $APP_ID"
else
  echo "    reusing existing app $APP_ID"
fi

echo "==> Ensuring service principal exists for $APP_ID"
SP_OBJECT_ID=$(az ad sp list --filter "appId eq '$APP_ID'" --query "[0].id" -o tsv)
if [[ -z "$SP_OBJECT_ID" || "$SP_OBJECT_ID" == "null" ]]; then
  SP_OBJECT_ID=$(az ad sp create --id "$APP_ID" --query id -o tsv)
  echo "    created service principal $SP_OBJECT_ID"
else
  echo "    reusing service principal $SP_OBJECT_ID"
fi

if [[ "$SCOPE_KIND" == "subscription" ]]; then
  SCOPE="/subscriptions/$SUBSCRIPTION_ID"
else
  SCOPE="/subscriptions/$SUBSCRIPTION_ID/resourceGroups/$RG"
fi

echo "==> Assigning role '$ROLE' at scope $SCOPE"
az role assignment create \
  --assignee-object-id "$SP_OBJECT_ID" \
  --assignee-principal-type ServicePrincipal \
  --role "$ROLE" \
  --scope "$SCOPE" \
  --output none || echo "    (role may already be assigned)"

if [[ "$ALSO_UAA" == "true" ]]; then
  echo "==> Assigning role 'User Access Administrator' at scope $SCOPE (Terraform creates role assignments)"
  az role assignment create \
    --assignee-object-id "$SP_OBJECT_ID" \
    --assignee-principal-type ServicePrincipal \
    --role "User Access Administrator" \
    --scope "$SCOPE" \
    --output none || echo "    (role may already be assigned)"
fi

SUBJECT="repo:${GH_OWNER}/${GH_REPO}:environment:${ENVIRONMENT}"
CRED_NAME="gh-${ENVIRONMENT}"

echo "==> Ensuring federated credential '$CRED_NAME' for subject '$SUBJECT'"
EXISTING_CRED=$(az ad app federated-credential list --id "$APP_ID" --query "[?name=='$CRED_NAME'] | [0].name" -o tsv)
if [[ -n "$EXISTING_CRED" && "$EXISTING_CRED" != "null" ]]; then
  echo "    federated credential already present"
else
  TMPFILE=$(mktemp)
  cat >"$TMPFILE" <<EOF
{
  "name": "$CRED_NAME",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "$SUBJECT",
  "audiences": ["api://AzureADTokenExchange"]
}
EOF
  az ad app federated-credential create --id "$APP_ID" --parameters @"$TMPFILE" --output none
  rm -f "$TMPFILE"
fi

cat <<DONE

Done. Use these values in GitHub:

  AZURE_CLIENT_ID        = $APP_ID
  AZURE_TENANT_ID        = $TENANT_ID
  AZURE_SUBSCRIPTION_ID  = $SUBSCRIPTION_ID

DONE

if [[ "$SET_SECRETS" == "true" ]]; then
  if ! command -v gh >/dev/null 2>&1; then
    echo "==> --set-secrets requested but gh CLI is not installed." >&2
    echo "    Install it from https://cli.github.com/ then re-run, or copy the values above manually." >&2
    exit 1
  fi
  if ! gh auth status >/dev/null 2>&1; then
    echo "==> --set-secrets requested but gh is not authenticated." >&2
    echo "    Run \`gh auth login\` (default scopes are sufficient) then re-run, or copy the values above manually." >&2
    exit 1
  fi
  REPO="${GH_OWNER}/${GH_REPO}"
  echo "==> Ensuring GitHub environment '$ENVIRONMENT' exists in $REPO"
  gh api -X PUT "repos/$REPO/environments/$ENVIRONMENT" --silent
  echo "==> Writing GitHub secrets to $REPO environment $ENVIRONMENT"
  gh secret set AZURE_CLIENT_ID --repo "$REPO" --env "$ENVIRONMENT" --body "$APP_ID"
  gh secret set AZURE_TENANT_ID --repo "$REPO" --env "$ENVIRONMENT" --body "$TENANT_ID"
  gh secret set AZURE_SUBSCRIPTION_ID --repo "$REPO" --env "$ENVIRONMENT" --body "$SUBSCRIPTION_ID"
fi
