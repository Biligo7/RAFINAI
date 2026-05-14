---
name: Bug report
about: Report something that doesn't work as expected
title: "[bug] "
labels: ["bug"]
---

## Environment

- Where it happens: <!-- local docker compose / Azure Container Apps / both -->
- Azure region (if deployed): <!-- e.g. westeurope -->
- AI provider: <!-- mock / azure_openai / openai_compatible -->
- Postgres: <!-- in-memory fallback / Postgres Flexible Server (B1ms / GP_*) / local docker -->
- Container Apps revision (if deployed): <!-- output of: az containerapp revision list -->
- Node version: <!-- node -v -->
- Terraform version: <!-- terraform version -->
- Git commit: <!-- git rev-parse --short HEAD -->

## What did you do?

<!-- Minimal reproduction steps. Include the exact commands or HTTP requests. -->

1.
2.
3.

## What did you expect?

## What actually happened?

## Logs / errors

<!--
Include relevant log lines. For deployed apps, paste the Kusto query you ran:

ContainerAppConsoleLogs_CL
| where ContainerAppName_s contains "backend"
| order by TimeGenerated desc
| take 50

If the issue is during `terraform apply`, include the failing resource and the
last few lines of output.
-->

```
<paste logs here>
```

## Anything else?

<!-- Screenshots, links to your fork, related docs sections you already checked. -->
