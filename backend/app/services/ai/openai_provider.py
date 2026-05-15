"""OpenAI / OpenAI-compatible provider using the official openai Python SDK."""

from __future__ import annotations

from collections.abc import AsyncIterator

from openai import AsyncOpenAI

from app.logging import get_logger
from app.services.ai.base import ChatCompletionMessage

logger = get_logger("ai.openai")


class OpenAICompatibleProvider:
    def __init__(self, api_key: str, base_url: str, default_model: str) -> None:
        if not api_key:
            logger.warning("OpenAI-compatible provider selected but OPENAI_API_KEY is empty")
        self._default_model = default_model
        self._client: AsyncOpenAI | None = None
        self._api_key = api_key
        self._base_url = base_url

    def _get_client(self) -> AsyncOpenAI:
        if self._client is None:
            self._client = AsyncOpenAI(
                api_key=self._api_key or "missing",
                base_url=self._base_url or None,
            )
        return self._client

    @property
    def name(self) -> str:
        return "openai_compatible"

    async def stream_chat_completion(
        self,
        *,
        messages: list[ChatCompletionMessage],
        model: str,
        temperature: float,
        max_tokens: int,
        request_id: str,
    ) -> AsyncIterator[str]:
        client = self._get_client()
        stream = await client.chat.completions.create(
            model=self._default_model or model,
            messages=[{"role": m.role, "content": m.content} for m in messages],
            temperature=temperature,
            max_tokens=max_tokens,
            stream=True,
        )
        async for chunk in stream:
            if chunk.choices and chunk.choices[0].delta and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content
