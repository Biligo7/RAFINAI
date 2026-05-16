"""Mock AI provider — streams a canned response token-by-token."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator

from app.services.ai.base import ChatCompletionMessage

CANNED_RESPONSE = (
    "This is a mock answer streamed token by token. "
    "Replace AI_PROVIDER with azure_openai or openai_compatible to call a real model."
)


class MockProvider:
    @property
    def name(self) -> str:
        return "mock"

    async def stream_chat_completion(
        self,
        *,
        messages: list[ChatCompletionMessage],
        model: str,
        temperature: float,
        max_tokens: int,
        request_id: str,
    ) -> AsyncIterator[str]:
        last_user = next(
            (m for m in reversed(messages) if m.role == "user"),
            None,
        )
        preface = ""
        if last_user:
            snippet = _text_preview(last_user.content)
            preface = f'Mock reply to: "{snippet}"\n\n'
        full = preface + CANNED_RESPONSE
        for token in full.split(" "):
            if not token:
                continue
            await asyncio.sleep(0.02)
            yield token + " "


mock_provider = MockProvider()


def _text_preview(content: object) -> str:
    if isinstance(content, str):
        return content[:80].replace("\n", " ")
    if isinstance(content, list):
        parts: list[str] = []
        for part in content:
            if not isinstance(part, dict):
                continue
            if part.get("type") == "text":
                parts.append(str(part.get("text", "")))
            elif part.get("type") == "image_url":
                parts.append("[image]")
        return " ".join(parts)[:80].replace("\n", " ")
    return str(content)[:80].replace("\n", " ")
