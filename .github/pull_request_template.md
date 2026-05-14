## Summary

<!-- One or two sentences. What changed and why. -->

## Type of change

<!-- Tick all that apply. -->

- [ ] Bug fix
- [ ] New feature / enhancement
- [ ] Documentation only
- [ ] Infrastructure (Terraform / CI / scripts)
- [ ] Refactor without behaviour change

## Test plan

<!-- Tick what you ran. Add anything custom. -->

- [ ] `cd backend && npm test` passes
- [ ] `cd backend && npm run lint` passes
- [ ] `cd frontend && npm run lint` passes
- [ ] `cd infra && terraform fmt -check -recursive`
- [ ] `cd infra && terraform validate`
- [ ] Local smoke test: `docker compose up --build` then `./scripts/smoke-test.sh --url http://localhost:8080`
- [ ] Deployed smoke test (if infra changed): `./scripts/smoke-test.sh --url $(terraform -chdir=infra output -raw frontend_url)`
- [ ] Other: <!-- describe -->

## Docs

- [ ] Updated `README.md` and/or `docs/` if behaviour or interfaces changed.
- [ ] Updated `AGENTS.md` file:line references if customization seams moved.

## Checklist

- [ ] One concern per pull request (see [`CONTRIBUTING.md`](../CONTRIBUTING.md)).
- [ ] No secrets in the diff (`.env`, API keys, Postgres passwords, state files).
- [ ] If this PR touches `infra/`, the `terraform-plan.yml` workflow output was reviewed.
