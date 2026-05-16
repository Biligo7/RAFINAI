from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from app.auth import get_request_user_id
from app.db.repository import get_repository
from app.models import FeedbackRequest

router = APIRouter()


@router.post("/api/messages/{message_id}/feedback", status_code=201)
async def post_feedback(message_id: str, body: FeedbackRequest, request: Request):
    repo = get_repository()
    user_id = await get_request_user_id(request)
    message = await repo.get_message(message_id, user_id)
    if message is None:
        raise HTTPException(status_code=404, detail="Message not found")
    feedback = await repo.upsert_feedback(message_id, body.rating, body.comment)
    return feedback.model_dump()
