"""Chat completion orchestration — streams tokens from the AI provider."""

from __future__ import annotations

import time
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from app.config import settings
from app.db.repository import get_repository
from app.logging import get_logger
from app.models import ImageAttachment, Message
from app.services.ai.base import ChatCompletionMessage
from app.services.ai.client import get_ai_provider

logger = get_logger("services.chat")


@dataclass
class StreamingChatResult:
    assistant_message_id: str
    full: str
    latency_ms: int


async def generate_chat_response(
    *,
    chat_id: str,
    user_message: Message,
    image_attachments: list[ImageAttachment] | None = None,
    request_id: str,
    on_assistant_start: Callable[[str], Any],
    on_token: Callable[[str], Any],
) -> StreamingChatResult:
    repo = get_repository()
    provider = get_ai_provider()

    chat = await repo.get_chat(chat_id)
    if chat is None:
        raise RuntimeError(f"Chat {chat_id} not found")

    history = await repo.list_messages(chat_id)

    system_prompt = chat.systemPrompt or settings.ai_system_prompt
    recent = history[-settings.ai_max_history_messages:]

    messages: list[ChatCompletionMessage] = [
        ChatCompletionMessage(role="system", content=system_prompt),
    ]
    for m in recent:
        if m.role in ("user", "assistant"):
            content = (
                _with_image_parts(m.content, image_attachments)
                if m.id == user_message.id and image_attachments
                else m.content
            )
            messages.append(ChatCompletionMessage(role=m.role, content=content))

    while _total_chars(messages) > settings.ai_max_input_chars and len(messages) > 2:
        messages.pop(1)

    assistant_message_id = str(uuid.uuid4())
    on_assistant_start(assistant_message_id)

    start = time.monotonic()
    full = ""

    chat_model = settings.resolved_chat_model

    try:
        async for token in provider.stream_chat_completion(
            messages=messages,
            model=chat_model,
            temperature=settings.ai_temperature,
            max_tokens=settings.ai_max_tokens,
            request_id=request_id,
        ):
            full += token
            on_token(token)
    except Exception as exc:
        latency_ms = int((time.monotonic() - start) * 1000)
        logger.exception(
            "AI provider error",
            request_id=request_id,
            chat_id=chat_id,
            latency_ms=latency_ms,
            error_type=type(exc).__name__,
            error_message=str(exc),
        )
        try:
            await repo.insert_message(
                chat_id, "assistant", full,
                message_id=assistant_message_id,
                provider=provider.name,
                model=chat_model,
                latency_ms=latency_ms,
                error_code="AI_PROVIDER_ERROR",
            )
        except Exception:
            logger.error("Failed to persist failed assistant message")
        raise

    latency_ms = int((time.monotonic() - start) * 1000)

    await repo.insert_message(
        chat_id, "assistant", full,
        message_id=assistant_message_id,
        provider=provider.name,
        model=chat_model,
        latency_ms=latency_ms,
    )

    logger.info(
        "chat.completion.completed",
        request_id=request_id,
        chat_id=chat_id,
        provider=provider.name,
        model=chat_model,
        latency_ms=latency_ms,
    )

    return StreamingChatResult(
        assistant_message_id=assistant_message_id,
        full=full,
        latency_ms=latency_ms,
    )


def _total_chars(messages: list[ChatCompletionMessage]) -> int:
    total = 0
    for message in messages:
        if isinstance(message.content, str):
            total += len(message.content)
        else:
            total += sum(len(str(part.get("text", ""))) for part in message.content)
    return total


def _with_image_parts(content: str, images: list[ImageAttachment]) -> list[dict[str, Any]]:
    parts: list[dict[str, Any]] = [{"type": "text", "text": content}]
    for image in images:
        parts.append(
            {
                "type": "image_url",
                "image_url": {"url": image.dataUrl},
            },
        )
    return parts
