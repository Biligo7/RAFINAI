"""Ensure tests run without Postgres before `app.config` is first imported."""

from __future__ import annotations

import os

# Must run before any `from app.*` that pulls in `settings`.
os.environ.setdefault("PG_HOST", "")
os.environ.setdefault("PG_DATABASE", "")
os.environ.setdefault("PG_USER", "")
os.environ.setdefault("PG_PASSWORD", "")
