"""Azure OpenAI provider using the official openai Python SDK."""

from __future__ import annotations

from collections.abc import AsyncIterator

from openai import APIStatusError, AsyncAzureOpenAI, BadRequestError, NotFoundError

from app.logging import get_logger
from app.services.ai.base import ChatCompletionMessage

logger = get_logger("ai.azure_openai")


class AzureOpenAIProvider:
    def __init__(self, endpoint: str, api_key: str, deployment: str, api_version: str) -> None:
        self._deployment = deployment.strip()
        if not endpoint or not api_key or not deployment:
            logger.warning(
                "Azure OpenAI config incomplete; calls will fail at runtime",
                has_endpoint=bool(endpoint),
                has_api_key=bool(api_key),
                has_deployment=bool(deployment),
            )
        self._client: AsyncAzureOpenAI | None = None
        self._endpoint = endpoint.strip().rstrip("/")
        self._api_key = api_key
        self._api_version = api_version

    def _get_client(self) -> AsyncAzureOpenAI:
        if self._client is None:
            self._client = AsyncAzureOpenAI(
                azure_endpoint=self._endpoint,
                api_key=self._api_key,
                api_version=self._api_version,
            )
        return self._client

    @property
    def name(self) -> str:
        return "azure_openai"

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
        params = {
            "model": self._deployment,
            "messages": [{"role": m.role, "content": m.content} for m in messages],
            "stream": True,
        }
        if _uses_reasoning_chat_params(self._deployment or model):
            params["max_completion_tokens"] = max_tokens
        else:
            params["temperature"] = temperature
            params["max_tokens"] = max_tokens

        try:
            stream = await client.chat.completions.create(**params)
        except NotFoundError as exc:
            raise RuntimeError(
                "Azure OpenAI deployment was not found. In Azure AI Foundry, "
                "copy the exact Deployment name into AZURE_OPENAI_DEPLOYMENT. "
                f"Current deployment: {self._deployment!r}."
            ) from exc
        except BadRequestError as exc:
            raise RuntimeError(f"Azure OpenAI rejected the request: {exc.message or str(exc)}") from exc
        except APIStatusError as exc:
            raise RuntimeError(
                f"Azure OpenAI request failed with status {exc.status_code}: {exc.message}"
            ) from exc

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
