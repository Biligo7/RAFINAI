"""AI provider protocol."""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Protocol

from pydantic import BaseModel


class ChatCompletionMessage(BaseModel):
    role: str
    content: str


class AIProvider(Protocol):
    @property
    def name(self) -> str: ...

    async def stream_chat_completion(
        self,
        *,
        messages: list[ChatCompletionMessage],
        model: str,
        temperature: float,
        max_tokens: int,
        request_id: str,
    ) -> AsyncIterator[str]: ...
