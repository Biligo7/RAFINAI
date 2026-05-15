from __future__ import annotations

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

from app.db.repository import get_repository
from app.models import CreateChatRequest, PatchChatRequest

router = APIRouter()


@router.get("/api/chats")
async def list_chats():
    chats = await get_repository().list_chats()
    return {"chats": [c.model_dump() for c in chats]}


@router.post("/api/chats", status_code=201)
async def create_chat(body: CreateChatRequest):
    chat = await get_repository().create_chat(body.title, body.systemPrompt)
    return chat.model_dump()


@router.get("/api/chats/{chat_id}")
async def get_chat(chat_id: str):
    chat = await get_repository().get_chat(chat_id)
    if chat is None:
        raise HTTPException(status_code=404, detail="Chat not found")
    return chat.model_dump()


@router.patch("/api/chats/{chat_id}")
async def patch_chat(chat_id: str, body: PatchChatRequest):
    if body.title is None and body.systemPrompt is None:
        raise HTTPException(status_code=400, detail="No fields to update")
    sp = body.systemPrompt if body.systemPrompt is not None else ...
    chat = await get_repository().update_chat(chat_id, title=body.title, system_prompt=sp)
    if chat is None:
        raise HTTPException(status_code=404, detail="Chat not found")
    return chat.model_dump()


@router.delete("/api/chats/{chat_id}", status_code=204)
async def delete_chat(chat_id: str):
    repo = get_repository()
    existing = await repo.get_chat(chat_id)
    if existing is None:
        raise HTTPException(status_code=404, detail="Chat not found")
    await repo.archive_chat(chat_id)
    return JSONResponse(status_code=204, content=None)
