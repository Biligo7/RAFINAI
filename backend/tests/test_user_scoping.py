from __future__ import annotations

import base64
import json

from app.db.memory_store import memory
from app.main import app
from starlette.testclient import TestClient


def _auth_headers(subject: str) -> dict[str, str]:
    payload = json.dumps({"sub": subject, "email": f"{subject}@example.com"}).encode()
    segment = base64.urlsafe_b64encode(payload).decode().rstrip("=")
    return {"Authorization": f"Bearer test.{segment}.signature"}


def test_chats_are_scoped_to_current_user() -> None:
    memory.reset()
    with TestClient(app) as client:
        user_a = _auth_headers("user-a")
        user_b = _auth_headers("user-b")

        created = client.post("/api/chats", json={"title": "A chat"}, headers=user_a)
        assert created.status_code == 201
        chat_id = created.json()["id"]

        list_a = client.get("/api/chats", headers=user_a)
        assert [chat["id"] for chat in list_a.json()["chats"]] == [chat_id]

        list_b = client.get("/api/chats", headers=user_b)
        assert list_b.json()["chats"] == []

        get_b = client.get(f"/api/chats/{chat_id}", headers=user_b)
        assert get_b.status_code == 404
