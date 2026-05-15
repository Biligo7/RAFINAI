from __future__ import annotations

from app.main import app
from starlette.testclient import TestClient


def test_healthz() -> None:
    with TestClient(app) as client:
        r = client.get("/healthz")
        assert r.status_code == 200
        assert r.json() == {"status": "ok", "service": "backend"}


def test_api_config() -> None:
    with TestClient(app) as client:
        r = client.get("/api/config")
        assert r.status_code == 200
        data = r.json()
        assert "appName" in data
        assert data.get("streamingEnabled") is True
