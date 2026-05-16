"""User preferences endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.db.repository import get_repository
from app.dependencies.auth import CurrentUser, get_current_user

router = APIRouter()


class PreferencesResponse(BaseModel):
    onboardingCompleted: bool
    preferences: list[str] | None


class SavePreferencesRequest(BaseModel):
    preferences: list[str]


@router.get("/api/users/me/preferences")
async def get_preferences(
    user: CurrentUser = Depends(get_current_user),
) -> PreferencesResponse:
    repo = get_repository()
    prefs = await repo.get_user_preferences(user.id)

    if not prefs:
        return PreferencesResponse(onboardingCompleted=False, preferences=None)

    pref_list = (
        [p.strip() for p in prefs["preferences_text"].split("\n") if p.strip()]
        if prefs["preferences_text"]
        else None
    )
    return PreferencesResponse(
        onboardingCompleted=prefs["onboarding_completed"],
        preferences=pref_list,
    )


@router.put("/api/users/me/preferences")
async def save_preferences(
    body: SavePreferencesRequest,
    user: CurrentUser = Depends(get_current_user),
) -> PreferencesResponse:
    repo = get_repository()
    completed = len(body.preferences) > 0
    preferences_text = "\n".join(body.preferences)
    await repo.upsert_user_preferences(
        user.id,
        preferences_text,
        onboarding_completed=completed,
    )

    return PreferencesResponse(
        onboardingCompleted=completed,
        preferences=body.preferences if completed else None,
    )
