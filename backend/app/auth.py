from __future__ import annotations

import base64
import json
from dataclasses import dataclass
from typing import Any

from fastapi import HTTPException, Request

from app.config import settings


@dataclass(frozen=True)
class RequestUser:
    external_subject: str
    email: str | None = None


def get_request_user(request: Request) -> RequestUser:
    auth_header = request.headers.get("authorization", "")
    scheme, _, token = auth_header.partition(" ")

    if scheme.lower() == "bearer" and token:
        payload = _decode_jwt_payload(token)
        sub = payload.get("sub")
        if not isinstance(sub, str) or not sub:
            raise HTTPException(status_code=401, detail="Invalid auth token")
        return RequestUser(
            external_subject=f"supabase:{sub}",
            email=_extract_email(payload),
        )

    if settings.auth_enabled:
        raise HTTPException(status_code=401, detail="Authentication required")

    return RequestUser(external_subject="local-dev")


async def get_request_user_id(request: Request) -> str:
    from app.db.repository import get_repository

    user = get_request_user(request)
    return await get_repository().get_or_create_user(user.external_subject, user.email)


def _decode_jwt_payload(token: str) -> dict[str, Any]:
    parts = token.split(".")
    if len(parts) < 2:
        raise HTTPException(status_code=401, detail="Invalid auth token")
    try:
        payload_segment = parts[1]
        padding = "=" * (-len(payload_segment) % 4)
        raw = base64.urlsafe_b64decode(payload_segment + padding)
        payload = json.loads(raw.decode("utf-8"))
    except (ValueError, json.JSONDecodeError):
        raise HTTPException(status_code=401, detail="Invalid auth token") from None
    if not isinstance(payload, dict):
        raise HTTPException(status_code=401, detail="Invalid auth token")
    return payload


def _extract_email(payload: dict[str, Any]) -> str | None:
    email = payload.get("email")
    if isinstance(email, str) and email:
        return email
    user_metadata = payload.get("user_metadata")
    if isinstance(user_metadata, dict):
        metadata_email = user_metadata.get("email")
        if isinstance(metadata_email, str) and metadata_email:
            return metadata_email
    return None
