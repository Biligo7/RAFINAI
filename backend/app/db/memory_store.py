"""In-memory repository fallback when Postgres is not configured."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from app.models import (
    Chat,
    Message,
    MessageFeedback,
    TrainingDataset,
    TrainingExample,
)


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


class MemoryStore:
    def __init__(self) -> None:
        self._users_by_subject: dict[str, str] = {}
        self._chat_owners: dict[str, str] = {}
        self._chats: dict[str, Chat] = {}
        self._messages: dict[str, Message] = {}
        self._feedback: dict[str, MessageFeedback] = {}
        self._datasets: dict[str, TrainingDataset] = {}
        self._examples: dict[str, TrainingExample] = {}

    # --- chats ---

    def get_or_create_user(self, external_subject: str, email: str | None = None) -> str:
        existing = self._users_by_subject.get(external_subject)
        if existing:
            return existing
        user_id = str(uuid.uuid4())
        self._users_by_subject[external_subject] = user_id
        return user_id

    def list_chats(self, user_id: str) -> list[Chat]:
        return sorted(
            [
                c for c in self._chats.values()
                if c.archivedAt is None and self._chat_owners.get(c.id) == user_id
            ],
            key=lambda c: c.updatedAt,
            reverse=True,
        )

    def create_chat(self, title: str, system_prompt: str | None = None, user_id: str | None = None) -> Chat:
        chat = Chat(
            id=str(uuid.uuid4()),
            title=title,
            systemPrompt=system_prompt,
            createdAt=_now_iso(),
            updatedAt=_now_iso(),
        )
        self._chats[chat.id] = chat
        if user_id is not None:
            self._chat_owners[chat.id] = user_id
        return chat

    def get_chat(self, chat_id: str, user_id: str | None = None) -> Chat | None:
        if user_id is not None and self._chat_owners.get(chat_id) != user_id:
            return None
        return self._chats.get(chat_id)

    def update_chat(self, chat_id: str, title: str | None = None, system_prompt: Any = ..., user_id: str | None = None) -> Chat | None:
        chat = self.get_chat(chat_id, user_id)
        if chat is None:
            return None
        data = chat.model_dump()
        if title is not None:
            data["title"] = title
        if system_prompt is not ...:
            data["systemPrompt"] = system_prompt
        data["updatedAt"] = _now_iso()
        updated = Chat(**data)
        self._chats[chat_id] = updated
        return updated

    def archive_chat(self, chat_id: str, user_id: str | None = None) -> None:
        chat = self.get_chat(chat_id, user_id)
        if chat is None:
            return
        data = chat.model_dump()
        data["archivedAt"] = _now_iso()
        data["updatedAt"] = _now_iso()
        self._chats[chat_id] = Chat(**data)

    # --- messages ---

    def list_messages(self, chat_id: str, user_id: str | None = None) -> list[Message]:
        if user_id is not None and self._chat_owners.get(chat_id) != user_id:
            return []
        return sorted(
            [m for m in self._messages.values() if m.chatId == chat_id],
            key=lambda m: m.createdAt,
        )

    def get_message(self, message_id: str, user_id: str | None = None) -> Message | None:
        message = self._messages.get(message_id)
        if message is None:
            return None
        if user_id is not None and self._chat_owners.get(message.chatId) != user_id:
            return None
        return message

    def insert_message(
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
        mid = message_id or str(uuid.uuid4())
        msg = Message(
            id=mid,
            chatId=chat_id,
            role=role,
            content=content,
            provider=provider,
            model=model,
            latencyMs=latency_ms,
            errorCode=error_code,
            metadata=metadata,
            createdAt=_now_iso(),
        )
        self._messages[mid] = msg
        chat = self._chats.get(chat_id)
        if chat:
            data = chat.model_dump()
            data["updatedAt"] = _now_iso()
            self._chats[chat_id] = Chat(**data)
        return msg

    # --- feedback ---

    def upsert_feedback(self, message_id: str, rating: int, comment: str | None = None) -> MessageFeedback:
        fb = MessageFeedback(
            id=str(uuid.uuid4()),
            messageId=message_id,
            rating=rating,
            comment=comment,
            createdAt=_now_iso(),
        )
        self._feedback[fb.id] = fb
        return fb

    # --- training datasets ---

    def list_datasets(self) -> list[TrainingDataset]:
        return sorted(self._datasets.values(), key=lambda d: d.updatedAt, reverse=True)

    def create_dataset(self, name: str, description: str | None = None) -> TrainingDataset:
        ds = TrainingDataset(
            id=str(uuid.uuid4()),
            name=name,
            description=description,
            createdAt=_now_iso(),
            updatedAt=_now_iso(),
        )
        self._datasets[ds.id] = ds
        return ds

    # --- training examples ---

    def list_examples(self, dataset_id: str | None = None, limit: int = 1000) -> list[TrainingExample]:
        exs = list(self._examples.values())
        if dataset_id:
            exs = [e for e in exs if e.datasetId == dataset_id]
        exs.sort(key=lambda e: e.createdAt, reverse=True)
        return exs[:limit]

    def create_example(
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
        ex = TrainingExample(
            id=str(uuid.uuid4()),
            datasetId=dataset_id,
            sourceChatId=source_chat_id,
            sourceUserMessageId=source_user_message_id,
            sourceAssistantMessageId=source_assistant_message_id,
            inputText=input_text,
            expectedOutputText=expected_output_text,
            tags=tags,
            metadata=metadata,
            createdAt=_now_iso(),
        )
        self._examples[ex.id] = ex
        return ex

    def reset(self) -> None:
        self._users_by_subject.clear()
        self._chat_owners.clear()
        self._chats.clear()
        self._messages.clear()
        self._feedback.clear()
        self._datasets.clear()
        self._examples.clear()


memory = MemoryStore()
