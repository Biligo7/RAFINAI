"""OpenAI / OpenAI-compatible provider using the official openai Python SDK."""

from __future__ import annotations

import os
from collections.abc import AsyncIterator

import httpx
from openai import AsyncOpenAI, BadRequestError

from app.logging import get_logger
from app.services.ai.base import ChatCompletionMessage

logger = get_logger("ai.openai")


def _resolve_base_url(raw: str) -> str:
    """Always return an absolute https base including /v1 for the OpenAI API path join."""
    s = (raw or "").strip().rstrip("/")
    if not s:
        return "https://api.openai.com/v1"
    if "://" not in s:
        s = "https://" + s.lstrip("/")
    if s.endswith("/v1"):
        return s
    if "api.openai.com" in s and not s.endswith("/v1"):
        return f"{s}/v1"
    return s


def _pick_safe_proxy() -> str | None:
    """Use a system proxy only if it has a scheme (empty or scheme-less values break httpx)."""

    for key in ("HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy"):
        p = (os.getenv(key) or "").strip()
        if not p:
            continue
        if p.startswith("http://") or p.startswith("https://"):
            return p
        logger.warning("Ignoring invalid proxy env (needs http:// or https:// scheme)", key=key)
    return None


class OpenAICompatibleProvider:
    def __init__(self, api_key: str, base_url: str, default_model: str) -> None:
        if not api_key:
            logger.warning("OpenAI-compatible provider selected but OPENAI_API_KEY is empty")
        self._default_model = default_model
        self._client: AsyncOpenAI | None = None
        self._http_client: httpx.AsyncClient | None = None
        self._api_key = api_key
        self._base_url = base_url

    def _get_client(self) -> AsyncOpenAI:
        if self._client is None:
            base = _resolve_base_url(self._base_url)
            # http2=False avoids some Docker / corporate proxy TLS or protocol issues.
            timeout = httpx.Timeout(120.0, connect=60.0, pool=30.0)
            proxy = _pick_safe_proxy()
            # trust_env=False: Docker Desktop on Windows often injects empty HTTP_PROXY / HTTPS_PROXY
            # which makes httpx build a request URL with no scheme (UnsupportedProtocol).
            self._http_client = httpx.AsyncClient(
                timeout=timeout,
                http2=False,
                trust_env=False,
                proxy=proxy,
            )
            self._client = AsyncOpenAI(
                api_key=self._api_key or "missing",
                base_url=base,
                http_client=self._http_client,
                max_retries=2,
            )
            logger.info(
                "OpenAI client initialized",
                base_url=base,
                http2=False,
                proxy_enabled=bool(proxy),
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
        selected_model = self._default_model or model
        params = {
            "model": selected_model,
            "messages": [{"role": m.role, "content": m.content} for m in messages],
            "stream": True,
        }
        if _uses_reasoning_chat_params(selected_model):
            params["max_completion_tokens"] = max_tokens
        else:
            params["temperature"] = temperature
            params["max_tokens"] = max_tokens

        try:
            stream = await client.chat.completions.create(**params)
        except BadRequestError as exc:
            raise RuntimeError(f"OpenAI request rejected: {exc.message or str(exc)}") from exc

        async for chunk in stream:
            if chunk.choices and chunk.choices[0].delta and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content


def _uses_reasoning_chat_params(model_or_deployment: str) -> bool:
    name = model_or_deployment.lower()
    return (
        name.startswith("gpt-5")
        or "gpt-5" in name
        or name.startswith("o1")
        or name.startswith("o3")
        or name.startswith("o4")
    )
