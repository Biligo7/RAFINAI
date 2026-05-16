from __future__ import annotations

import asyncio
import json
import uuid
from collections.abc import AsyncIterator

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from app.db.repository import get_repository
from app.models import ImageAttachment, SaveMessageRequest, SendMessageRequest
from app.services.chat_service import generate_chat_response

router = APIRouter()


@router.get("/api/chats/{chat_id}/messages")
async def list_messages(chat_id: str):
    repo = get_repository()
    chat = await repo.get_chat(chat_id)
    if chat is None:
        raise HTTPException(status_code=404, detail="Chat not found")
    messages = await repo.list_messages(chat_id)
    return {"messages": [m.model_dump() for m in messages]}


@router.post("/api/chats/{chat_id}/messages/save")
async def save_message(chat_id: str, body: SaveMessageRequest):
    """Insert a single message (user or assistant) without triggering AI."""
    repo = get_repository()
    chat = await repo.get_chat(chat_id)
    if chat is None:
        raise HTTPException(status_code=404, detail="Chat not found")
    msg = await repo.insert_message(chat_id, body.role, body.content)
    return msg.model_dump()


@router.post("/api/chats/{chat_id}/messages")
async def send_message(chat_id: str, body: SendMessageRequest, request: Request):
    repo = get_repository()
    chat = await repo.get_chat(chat_id)
    if chat is None:
        raise HTTPException(status_code=404, detail="Chat not found")

    if not body.content.strip():
        raise HTTPException(status_code=400, detail="Message content is required")

    user_message = await repo.insert_message(
        chat_id,
        "user",
        body.content,
        metadata=_image_metadata(body.images),
    )
    request_id = request.headers.get("x-request-id", str(uuid.uuid4()))

    queue: asyncio.Queue[str | None] = asyncio.Queue()

    def _sse_event(event: str, data: dict) -> str:
        return f"event: {event}\ndata: {json.dumps(data)}\n\n"

    async def _producer():
        """Run the AI completion and push SSE chunks into the queue."""
        try:
            result = await generate_chat_response(
                chat_id=chat_id,
                user_message=user_message,
                image_attachments=body.images,
                request_id=request_id,
                on_assistant_start=lambda mid: queue.put_nowait(
                    _sse_event("message.created", {"messageId": mid, "role": "assistant"})
                ),
                on_token=lambda delta: queue.put_nowait(
                    _sse_event("token", {"delta": delta})
                ),
            )
            queue.put_nowait(
                _sse_event("message.completed", {"messageId": result.assistant_message_id, "content": result.full})
            )
            queue.put_nowait(_sse_event("done", {}))
        except Exception as exc:
            queue.put_nowait(
                _sse_event("error", {"code": "AI_PROVIDER_ERROR", "message": str(exc)})
            )
        finally:
            queue.put_nowait(None)  # sentinel

    async def _consumer() -> AsyncIterator[str]:
        """Yield SSE chunks to the StreamingResponse as they arrive."""
        task = asyncio.create_task(_producer())
        try:
            while True:
                chunk = await queue.get()
                if chunk is None:
                    break
                yield chunk
        finally:
            if not task.done():
                task.cancel()

    return StreamingResponse(
        _consumer(),
        media_type="text/event-stream; charset=utf-8",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


def _image_metadata(images: list[ImageAttachment]) -> dict | None:
    if not images:
        return None
    return {
        "images": [
            {
                "name": image.name,
                "mediaType": image.mediaType,
                "thumbnailDataUrl": image.thumbnailDataUrl or image.dataUrl,
            }
            for image in images
        ],
    }
