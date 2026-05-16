"""FastAPI dependency to resolve the current user from Supabase JWT."""

from __future__ import annotations

from dataclasses import dataclass

import jwt
from fastapi import Header, HTTPException

from app.config import settings
from app.db.repository import get_repository


@dataclass
class CurrentUser:
    id: str
    external_subject: str
    email: str | None


def _external_subject_from_payload(payload: dict) -> str:
    sub = payload.get("sub")
    if not isinstance(sub, str) or not sub:
        raise HTTPException(status_code=401, detail="Token missing sub claim")
    return f"supabase:{sub}"


async def get_current_user(
    authorization: str | None = Header(default=None),
) -> CurrentUser:
    """Resolve JWT to app_users row (same external_subject scheme as app.auth.get_request_user)."""
    if not settings.auth_enabled:
        raise HTTPException(status_code=501, detail="Auth is not enabled")

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")

    token = authorization[7:]

    try:
        payload = jwt.decode(token, options={"verify_signature": False})
    except jwt.DecodeError as exc:
        raise HTTPException(status_code=401, detail="Invalid token") from exc

    if not isinstance(payload, dict):
        raise HTTPException(status_code=401, detail="Invalid token")

    external_key = _external_subject_from_payload(payload)
    email = payload.get("email")
    email_s = email if isinstance(email, str) and email else None

    uid = await get_repository().get_or_create_user(external_key, email_s)
    return CurrentUser(id=uid, external_subject=external_key, email=email_s)


async def get_optional_user(
    authorization: str | None = Header(default=None),
) -> CurrentUser | None:
    """Like get_current_user but returns None when auth is disabled or no token."""
    if not settings.auth_enabled or not authorization:
        return None
    try:
        return await get_current_user(authorization)
    except HTTPException:
        return None
