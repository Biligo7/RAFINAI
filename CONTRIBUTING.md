# Contributing

## Local development

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
docker compose up --build
```

Frontend: <http://localhost:8080>
Backend (direct): <http://localhost:3000/healthz>

### Backend (Python) without Docker

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
ruff check app tests
pytest tests/
uvicorn app.main:app --reload --port 3000
```

## Coding standards

- **Backend:** Python 3.12+, `ruff` + `pytest` (see `backend/requirements-dev.txt`).
- **Frontend:** TypeScript strict mode — `npm run lint` and `npm run build` in `frontend/`.
- Run `terraform fmt -recursive` in `infra/` before opening a pull request.
- Keep dependencies minimal.

## Commit messages

Use short imperative commit messages. Include a body when the change is non-obvious.

## Pull requests

- One concern per pull request.
- Update `README.md` and `docs/` when behavior or interfaces change.
- The `terraform-plan.yml` workflow runs on PRs that touch `infra/`. Review the plan output before merging.
