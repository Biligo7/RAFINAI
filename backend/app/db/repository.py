"""Repository facade — dispatches to Postgres or in-memory fallback."""

from __future__ import annotations

from typing import Any

from app.config import settings
from app.logging import get_logger
from app.models import (
    Chat,
    Message,
    MessageFeedback,
    TrainingDataset,
    TrainingExample,
)

logger = get_logger("db.repository")


class Repository:
    """Unified async interface over Postgres queries or the in-memory store."""

    def __init__(self, use_sql: bool) -> None:
        self._use_sql = use_sql

    async def get_or_create_user(self, external_subject: str, email: str | None = None) -> str:
        if self._use_sql:
            from app.db.queries import get_or_create_app_user
            return await get_or_create_app_user(external_subject, email)
        from app.db.memory_store import memory
        return memory.get_or_create_user(external_subject, email)

    # ---- Chats ----

    async def list_chats(self, user_id: str) -> list[Chat]:
        if self._use_sql:
            from app.db.queries import list_chats
            return await list_chats(user_id)
        from app.db.memory_store import memory
        return memory.list_chats(user_id)

    async def create_chat(self, title: str, system_prompt: str | None = None, user_id: str | None = None) -> Chat:
        if self._use_sql:
            from app.db.queries import create_chat
            return await create_chat(title, system_prompt, user_id)
        from app.db.memory_store import memory
        return memory.create_chat(title, system_prompt, user_id)

    async def get_chat(self, chat_id: str, user_id: str | None = None) -> Chat | None:
        if self._use_sql:
            from app.db.queries import get_chat
            return await get_chat(chat_id, user_id)
        from app.db.memory_store import memory
        return memory.get_chat(chat_id, user_id)

    async def update_chat(self, chat_id: str, title: str | None = None, system_prompt: Any = ..., user_id: str | None = None) -> Chat | None:
        if self._use_sql:
            from app.db.queries import update_chat
            return await update_chat(chat_id, title, system_prompt, user_id)
        from app.db.memory_store import memory
        return memory.update_chat(chat_id, title, system_prompt, user_id)

    async def archive_chat(self, chat_id: str, user_id: str | None = None) -> None:
        if self._use_sql:
            from app.db.queries import archive_chat
            return await archive_chat(chat_id, user_id)
        from app.db.memory_store import memory
        return memory.archive_chat(chat_id, user_id)

    # ---- Messages ----

    async def list_messages(self, chat_id: str, user_id: str | None = None) -> list[Message]:
        if self._use_sql:
            from app.db.queries import list_messages
            return await list_messages(chat_id, user_id)
        from app.db.memory_store import memory
        return memory.list_messages(chat_id, user_id)

    async def get_message(self, message_id: str, user_id: str | None = None) -> Message | None:
        if self._use_sql:
            from app.db.queries import get_message
            return await get_message(message_id, user_id)
        from app.db.memory_store import memory
        return memory.get_message(message_id, user_id)

    async def insert_message(
        self,
        chat_id: str,
        role: str,
        content: str,
        *,
        message_id: str | None = None,
        provider: str | None = None,
        model: str | None = None,
        latency_ms: int | None = None,
        error_code: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> Message:
        if self._use_sql:
            from app.db.queries import insert_message
            return await insert_message(
                chat_id, role, content,
                message_id=message_id, provider=provider, model=model,
                latency_ms=latency_ms, error_code=error_code, metadata=metadata,
            )
        from app.db.memory_store import memory
        return memory.insert_message(
            chat_id, role, content,
            message_id=message_id, provider=provider, model=model,
            latency_ms=latency_ms, error_code=error_code, metadata=metadata,
        )

    # ---- Feedback ----

    async def upsert_feedback(self, message_id: str, rating: int, comment: str | None = None) -> MessageFeedback:
        if self._use_sql:
            from app.db.queries import upsert_feedback
            return await upsert_feedback(message_id, rating, comment)
        from app.db.memory_store import memory
        return memory.upsert_feedback(message_id, rating, comment)

    # ---- Training ----

    async def list_datasets(self) -> list[TrainingDataset]:
        if self._use_sql:
            from app.db.queries import list_datasets
            return await list_datasets()
        from app.db.memory_store import memory
        return memory.list_datasets()

    async def create_dataset(self, name: str, description: str | None = None) -> TrainingDataset:
        if self._use_sql:
            from app.db.queries import create_dataset
            return await create_dataset(name, description)
        from app.db.memory_store import memory
        return memory.create_dataset(name, description)

    async def list_examples(self, dataset_id: str | None = None, limit: int = 1000) -> list[TrainingExample]:
        if self._use_sql:
            from app.db.queries import list_examples
            return await list_examples(dataset_id, limit)
        from app.db.memory_store import memory
        return memory.list_examples(dataset_id, limit)

    async def create_example(
        self,
        input_text: str,
        expected_output_text: str,
        *,
        dataset_id: str | None = None,
        source_chat_id: str | None = None,
        source_user_message_id: str | None = None,
        source_assistant_message_id: str | None = None,
        tags: list[str] | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> TrainingExample:
        if self._use_sql:
            from app.db.queries import create_example
            return await create_example(
                input_text, expected_output_text,
                dataset_id=dataset_id, source_chat_id=source_chat_id,
                source_user_message_id=source_user_message_id,
                source_assistant_message_id=source_assistant_message_id,
                tags=tags, metadata=metadata,
            )
        from app.db.memory_store import memory
        return memory.create_example(
            input_text, expected_output_text,
            dataset_id=dataset_id, source_chat_id=source_chat_id,
            source_user_message_id=source_user_message_id,
            source_assistant_message_id=source_assistant_message_id,
            tags=tags, metadata=metadata,
        )

    # ---- User Preferences ----

    async def get_user_preferences(self, user_id: str) -> dict | None:
        if self._use_sql:
            from app.db.queries import get_user_preferences
            return await get_user_preferences(user_id)
        return None

    async def upsert_user_preferences(
        self, user_id: str, preferences_text: str, onboarding_completed: bool = True
    ) -> None:
        if self._use_sql:
            from app.db.queries import upsert_user_preferences
            await upsert_user_preferences(user_id, preferences_text, onboarding_completed)

    # ---- App events ----

    async def record_event(
        self,
        event_type: str,
        severity: str,
        request_id: str | None = None,
        message: str | None = None,
        properties: dict[str, Any] | None = None,
    ) -> None:
        if self._use_sql:
            from app.db.queries import record_event
            await record_event(event_type, severity, request_id, message, properties)


def get_repository() -> Repository:
    return Repository(use_sql=settings.sql_enabled)


def log_repository_mode() -> None:
    if settings.sql_enabled:
        logger.info("Repository: Postgres", host=settings.pg_host)
    else:
        logger.warning("Repository: in-memory fallback (Postgres not configured)")
