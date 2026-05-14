#!/usr/bin/env bash
# Fails the job with a clear, aggregated error when one or more named
# environment variables are empty or unset. Catches missing GitHub
# Environment secrets/vars before Terraform runs, so contributors get a
# useful message instead of a cryptic downstream validation error.
#
# Usage (from a workflow step, after populating env: with the values):
#   .github/scripts/check-required.sh AZURE_CLIENT_ID AZURE_TENANT_ID ...

set -eo pipefail

missing=()
for name in "$@"; do
  if [[ -z "${!name:-}" ]]; then
    missing+=("$name")
  fi
done

if (( ${#missing[@]} > 0 )); then
  {
    echo "::error::Missing required inputs: ${missing[*]}"
    echo
    echo "The following values are unset or empty:"
    for n in "${missing[@]}"; do
      echo "  - $n"
    done
    echo
    echo "Fix one of:"
    echo
    echo "  1. GitHub Actions (this workflow):"
    echo "     Settings -> Environments -> <env> -> Add secret / Add variable."
    echo "     Names ending in '_password', '_api_key', '_CLIENT_ID', '_TENANT_ID',"
    echo "     '_SUBSCRIPTION_ID' belong as Secrets; everything else as a Variable."
    echo
    echo "  2. Local Terraform runs (not this workflow):"
    echo "     Copy infra/terraform.tfvars.example to infra/terraform.tfvars and"
    echo "     set the missing TF_VAR_* values (without the 'TF_VAR_' prefix)."
    echo "     terraform.tfvars is gitignored. Non-TF_VAR_ inputs (AZURE_*,"
    echo "     TF_STATE_*) still need to be exported in your shell."
  } >&2
  exit 1
fi

echo "All required inputs are present."
