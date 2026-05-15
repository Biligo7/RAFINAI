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
            snippet = last_user.content[:80].replace("\n", " ")
            preface = f'Mock reply to: "{snippet}"\n\n'
        full = preface + CANNED_RESPONSE
        for token in full.split(" "):
            if not token:
                continue
            await asyncio.sleep(0.02)
            yield token + " "


mock_provider = MockProvider()
