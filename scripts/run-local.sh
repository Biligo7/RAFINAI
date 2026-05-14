#!/usr/bin/env bash
# Convenience wrapper around docker compose for local development.

set -euo pipefail

cd "$(dirname "$0")/.."

if [[ ! -f backend/.env ]]; then
  echo "==> Creating backend/.env from .env.example"
  cp backend/.env.example backend/.env
fi

if [[ ! -f frontend/.env ]]; then
  echo "==> Creating frontend/.env from .env.example"
  cp frontend/.env.example frontend/.env
fi

docker compose up --build "$@"
