# Related Microsoft samples

If you want to swap a major piece of this stack for a different starting point, the following Microsoft samples are useful references.

| You want… | Sample |
| --- | --- |
| A Python FastAPI backend with Azure OpenAI streaming | [Azure-Samples/openai-chat-backend-fastapi](https://github.com/Azure-Samples/openai-chat-backend-fastapi) |
| A pre-built classic chat UI component library | [Azure-Samples/azure-openai-chat-frontend](https://github.com/Azure-Samples/azure-openai-chat-frontend) |
| A full-featured Azure OpenAI chat webapp with RAG / on-your-data | [microsoft/sample-app-aoai-chatGPT](https://github.com/microsoft/sample-app-aoai-chatGPT) |
| A different Terraform + Container Apps + Azure OpenAI reference | [Azure-Samples/container-apps-openai](https://github.com/Azure-Samples/container-apps-openai) |

If you copy code from any MIT-licensed sample, preserve the license header and credit the upstream in the relevant file.

## Why we don't depend on `azd`

Azure Developer CLI (`azd`) is a great experience, but it ties deployment to its own opinionated lifecycle. This project uses plain Terraform + GitHub Actions so:

- The artifacts (state, plans, role assignments) are visible and auditable in the same way you'd run any other Terraform project.
- You can lift the `infra/` directory into a multi-stack Terraform monorepo without untangling `azd` glue.
- The CI pipeline is standard and works in any GitHub repo without `azd` installed.

You can adopt `azd` later by treating the existing Terraform as a hand-rolled provisioning step.

## Reference reading

- [Azure Container Apps plans](https://learn.microsoft.com/en-us/azure/container-apps/plans)
- [Azure Container Apps cold start](https://learn.microsoft.com/en-us/azure/container-apps/cold-start)
- [Service-to-service communication](https://learn.microsoft.com/en-us/azure/container-apps/connect-apps)
- [Container Apps logging with Log Analytics](https://learn.microsoft.com/en-us/azure/container-apps/log-monitoring)
- [Managed identity image pulls](https://learn.microsoft.com/en-us/azure/container-apps/managed-identity-image-pull)
- [Azure Database for PostgreSQL Flexible Server overview](https://learn.microsoft.com/en-us/azure/postgresql/flexible-server/overview)
- [Postgres Flexible Server compute and storage](https://learn.microsoft.com/en-us/azure/postgresql/flexible-server/concepts-compute-storage)
- [Azure Container Registry SKUs](https://learn.microsoft.com/en-us/azure/container-registry/container-registry-skus)
- [GitHub Actions OIDC in Azure](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-azure)
- [Azure Login with OIDC](https://learn.microsoft.com/en-us/azure/developer/github/connect-from-azure-openid-connect)
- [Terraform AzureRM provider](https://registry.terraform.io/providers/hashicorp/azurerm/latest/docs)

## See also

- [`follow-ups.md#7-optional-add-azure-developer-cli-azd-support`](follow-ups.md#7-optional-add-azure-developer-cli-azd-support) — adding optional `azd` integration without dropping the Terraform + GitHub Actions flow.
- [`architecture.md`](architecture.md) — how this template's pieces fit together when comparing against the upstream samples above.
