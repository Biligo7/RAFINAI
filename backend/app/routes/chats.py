from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, Response

from app.auth import get_request_user_id
from app.db.repository import get_repository
from app.models import CreateChatRequest, PatchChatRequest

router = APIRouter()


@router.get("/api/chats")
async def list_chats(request: Request):
    user_id = await get_request_user_id(request)
    chats = await get_repository().list_chats(user_id)
    return {"chats": [c.model_dump() for c in chats]}


@router.post("/api/chats", status_code=201)
async def create_chat(body: CreateChatRequest, request: Request):
    user_id = await get_request_user_id(request)
    chat = await get_repository().create_chat(body.title, body.systemPrompt, user_id)
    return chat.model_dump()


@router.get("/api/chats/{chat_id}")
async def get_chat(chat_id: str, request: Request):
    user_id = await get_request_user_id(request)
    chat = await get_repository().get_chat(chat_id, user_id)
    if chat is None:
        raise HTTPException(status_code=404, detail="Chat not found")
    return chat.model_dump()


@router.patch("/api/chats/{chat_id}")
async def patch_chat(chat_id: str, body: PatchChatRequest, request: Request):
    user_id = await get_request_user_id(request)
    if body.title is None and body.systemPrompt is None:
        raise HTTPException(status_code=400, detail="No fields to update")
    sp = body.systemPrompt if body.systemPrompt is not None else ...
    chat = await get_repository().update_chat(
        chat_id,
        title=body.title,
        system_prompt=sp,
        user_id=user_id,
    )
    if chat is None:
        raise HTTPException(status_code=404, detail="Chat not found")
    return chat.model_dump()


@router.delete("/api/chats/{chat_id}", status_code=204)
async def delete_chat(chat_id: str, request: Request):
    repo = get_repository()
    user_id = await get_request_user_id(request)
    existing = await repo.get_chat(chat_id, user_id)
    if existing is None:
        raise HTTPException(status_code=404, detail="Chat not found")
    await repo.archive_chat(chat_id, user_id)
    return Response(status_code=204)
