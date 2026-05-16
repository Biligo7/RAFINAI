"""Postgres query layer — mirrors the TypeScript queries.ts one-to-one."""

from __future__ import annotations

import json
import uuid
from typing import Any

import asyncpg

from app.db.pool import get_pool
from app.models import (
    Chat,
    Message,
    MessageFeedback,
    TrainingDataset,
    TrainingExample,
)


def _chat_from_row(r: asyncpg.Record) -> Chat:
    return Chat(
        id=str(r["id"]),
        title=r["title"],
        systemPrompt=r["system_prompt"],
        model=r["model"],
        temperature=float(r["temperature"]) if r["temperature"] is not None else None,
        archivedAt=r["archived_at"].isoformat() if r["archived_at"] else None,
        createdAt=r["created_at"].isoformat(),
        updatedAt=r["updated_at"].isoformat(),
    )


def _message_from_row(r: asyncpg.Record) -> Message:
    meta = None
    if r["metadata_json"]:
        try:
            meta = json.loads(r["metadata_json"])
        except (json.JSONDecodeError, TypeError):
            pass
    return Message(
        id=str(r["id"]),
        chatId=str(r["chat_id"]),
        role=r["role"],
        content=r["content"],
        tokenCount=r["token_count"],
        provider=r["provider"],
        model=r["model"],
        latencyMs=r["latency_ms"],
        errorCode=r["error_code"],
        metadata=meta,
        createdAt=r["created_at"].isoformat(),
    )


def _feedback_from_row(r: asyncpg.Record) -> MessageFeedback:
    return MessageFeedback(
        id=str(r["id"]),
        messageId=str(r["message_id"]),
        rating=1 if r["rating"] == 1 else -1,
        comment=r["comment"],
        createdAt=r["created_at"].isoformat(),
    )


def _dataset_from_row(r: asyncpg.Record) -> TrainingDataset:
    return TrainingDataset(
        id=str(r["id"]),
        name=r["name"],
        description=r["description"],
        createdAt=r["created_at"].isoformat(),
        updatedAt=r["updated_at"].isoformat(),
    )


def _example_from_row(r: asyncpg.Record) -> TrainingExample:
    tags = None
    if r["tags_json"]:
        try:
            parsed = json.loads(r["tags_json"])
            tags = parsed if isinstance(parsed, list) else None
        except (json.JSONDecodeError, TypeError):
            pass
    meta = None
    if r["metadata_json"]:
        try:
            meta = json.loads(r["metadata_json"])
        except (json.JSONDecodeError, TypeError):
            pass
    return TrainingExample(
        id=str(r["id"]),
        datasetId=str(r["dataset_id"]) if r["dataset_id"] else None,
        sourceChatId=str(r["source_chat_id"]) if r["source_chat_id"] else None,
        sourceUserMessageId=str(r["source_user_message_id"]) if r["source_user_message_id"] else None,
        sourceAssistantMessageId=str(r["source_assistant_message_id"]) if r["source_assistant_message_id"] else None,
        inputText=r["input_text"],
        expectedOutputText=r["expected_output_text"],
        tags=tags,
        metadata=meta,
        createdAt=r["created_at"].isoformat(),
    )


# ---- Chats ----

async def get_or_create_app_user(external_subject: str, email: str | None = None) -> str:
    pool = await get_pool()
    row = await pool.fetchrow(
        "SELECT id FROM app_users WHERE external_subject = $1",
        external_subject,
    )
    if row:
        if email:
            await pool.execute(
                "UPDATE app_users SET email = $2, updated_at = now() WHERE id = $1",
                row["id"],
                email,
            )
        return str(row["id"])

    uid = str(uuid.uuid4())
    try:
        await pool.execute(
            """INSERT INTO app_users (id, external_subject, email)
               VALUES ($1, $2, $3)""",
            uid,
            external_subject,
            email,
        )
    except asyncpg.UniqueViolationError:
        row = await pool.fetchrow(
            "SELECT id FROM app_users WHERE external_subject = $1",
            external_subject,
        )
        if row:
            return str(row["id"])
        raise
    return uid


async def list_chats(user_id: str) -> list[Chat]:
    pool = await get_pool()
    rows = await pool.fetch(
        """SELECT id, user_id, title, system_prompt, model, temperature,
                  archived_at, created_at, updated_at
           FROM chats
           WHERE archived_at IS NULL AND user_id = $1
           ORDER BY updated_at DESC""",
        user_id,
    )
    return [_chat_from_row(r) for r in rows]


async def create_chat(title: str, system_prompt: str | None = None, user_id: str | None = None) -> Chat:
    pool = await get_pool()
    cid = str(uuid.uuid4())
    await pool.execute(
        "INSERT INTO chats (id, user_id, title, system_prompt) VALUES ($1, $2, $3, $4)",
        cid, user_id, title, system_prompt,
    )
    chat = await get_chat(cid, user_id)
    if chat is None:
        raise RuntimeError("Chat insert succeeded but row not found")
    return chat


async def get_chat(chat_id: str, user_id: str | None = None) -> Chat | None:
    pool = await get_pool()
    if user_id is None:
        row = await pool.fetchrow(
            """SELECT id, user_id, title, system_prompt, model, temperature,
                      archived_at, created_at, updated_at
               FROM chats WHERE id = $1""",
            chat_id,
        )
        return _chat_from_row(row) if row else None

    row = await pool.fetchrow(
        """SELECT id, user_id, title, system_prompt, model, temperature,
                  archived_at, created_at, updated_at
           FROM chats WHERE id = $1 AND user_id = $2""",
        chat_id,
        user_id,
    )
    return _chat_from_row(row) if row else None


async def update_chat(chat_id: str, title: str | None = None, system_prompt: Any = ..., user_id: str | None = None) -> Chat | None:
    pool = await get_pool()
    set_parts = ["updated_at = now()"]
    values: list[Any] = []
    idx = 0
    if title is not None:
        idx += 1
        values.append(title)
        set_parts.append(f"title = ${idx}")
    if system_prompt is not ...:
        idx += 1
        values.append(system_prompt)
        set_parts.append(f"system_prompt = ${idx}")
    idx += 1
    values.append(chat_id)
    where = f"id = ${idx}"
    if user_id is not None:
        idx += 1
        values.append(user_id)
        where += f" AND user_id = ${idx}"
    await pool.execute(
        f"UPDATE chats SET {', '.join(set_parts)} WHERE {where}",
        *values,
    )
    return await get_chat(chat_id, user_id)


async def archive_chat(chat_id: str, user_id: str | None = None) -> None:
    pool = await get_pool()
    if user_id is None:
        await pool.execute(
            "UPDATE chats SET archived_at = now(), updated_at = now() WHERE id = $1",
            chat_id,
        )
    else:
        await pool.execute(
            """UPDATE chats SET archived_at = now(), updated_at = now()
               WHERE id = $1 AND user_id = $2""",
            chat_id,
            user_id,
        )


# ---- Messages ----

async def list_messages(chat_id: str, user_id: str | None = None) -> list[Message]:
    pool = await get_pool()
    if user_id is None:
        rows = await pool.fetch(
            """SELECT id, chat_id, role, content, token_count, provider, model,
                      latency_ms, error_code, metadata_json, created_at
               FROM messages WHERE chat_id = $1
               ORDER BY created_at ASC""",
            chat_id,
        )
        return [_message_from_row(r) for r in rows]

    rows = await pool.fetch(
        """SELECT m.id, m.chat_id, m.role, m.content, m.token_count, m.provider, m.model,
                  m.latency_ms, m.error_code, m.metadata_json, m.created_at
           FROM messages m
           JOIN chats c ON c.id = m.chat_id
           WHERE m.chat_id = $1 AND c.user_id = $2
           ORDER BY m.created_at ASC""",
        chat_id,
        user_id,
    )
    return [_message_from_row(r) for r in rows]


async def get_message(message_id: str, user_id: str | None = None) -> Message | None:
    pool = await get_pool()
    if user_id is None:
        row = await pool.fetchrow(
            """SELECT id, chat_id, role, content, token_count, provider, model,
                      latency_ms, error_code, metadata_json, created_at
               FROM messages WHERE id = $1""",
            message_id,
        )
        return _message_from_row(row) if row else None

    row = await pool.fetchrow(
        """SELECT m.id, m.chat_id, m.role, m.content, m.token_count, m.provider, m.model,
                  m.latency_ms, m.error_code, m.metadata_json, m.created_at
           FROM messages m
           JOIN chats c ON c.id = m.chat_id
           WHERE m.id = $1 AND c.user_id = $2""",
        message_id,
        user_id,
    )
    return _message_from_row(row) if row else None


async def insert_message(
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
    pool = await get_pool()
    mid = message_id or str(uuid.uuid4())
    await pool.execute(
        """INSERT INTO messages
             (id, chat_id, role, content, provider, model, latency_ms, error_code, metadata_json)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)""",
        mid, chat_id, role, content,
        provider, model, latency_ms, error_code,
        json.dumps(metadata) if metadata else None,
    )
    await pool.execute("UPDATE chats SET updated_at = now() WHERE id = $1", chat_id)
    msg = await get_message(mid)
    if msg is None:
        raise RuntimeError("Message insert succeeded but row not found")
    return msg


# ---- Feedback ----

async def upsert_feedback(message_id: str, rating: int, comment: str | None = None) -> MessageFeedback:
    pool = await get_pool()
    fid = str(uuid.uuid4())
    await pool.execute(
        "INSERT INTO message_feedback (id, message_id, rating, comment) VALUES ($1, $2, $3, $4)",
        fid, message_id, rating, comment,
    )
    row = await pool.fetchrow(
        "SELECT id, message_id, rating, comment, created_at FROM message_feedback WHERE id = $1",
        fid,
    )
    if row is None:
        raise RuntimeError("Feedback insert succeeded but row not found")
    return _feedback_from_row(row)


# ---- Training datasets ----

async def list_datasets() -> list[TrainingDataset]:
    pool = await get_pool()
    rows = await pool.fetch(
        "SELECT id, name, description, created_at, updated_at FROM training_datasets ORDER BY updated_at DESC"
    )
    return [_dataset_from_row(r) for r in rows]


async def create_dataset(name: str, description: str | None = None) -> TrainingDataset:
    pool = await get_pool()
    did = str(uuid.uuid4())
    await pool.execute(
        "INSERT INTO training_datasets (id, name, description) VALUES ($1, $2, $3)",
        did, name, description,
    )
    row = await pool.fetchrow(
        "SELECT id, name, description, created_at, updated_at FROM training_datasets WHERE id = $1",
        did,
    )
    if row is None:
        raise RuntimeError("Dataset insert succeeded but row not found")
    return _dataset_from_row(row)


# ---- Training examples ----

async def list_examples(dataset_id: str | None = None, limit: int = 1000) -> list[TrainingExample]:
    pool = await get_pool()
    capped_limit = min(max(limit, 1), 10_000)
    if dataset_id:
        rows = await pool.fetch(
            """SELECT id, dataset_id, source_chat_id, source_user_message_id,
                      source_assistant_message_id, input_text, expected_output_text,
                      tags_json, metadata_json, created_at
               FROM training_examples WHERE dataset_id = $1
               ORDER BY created_at DESC LIMIT $2""",
            dataset_id, capped_limit,
        )
    else:
        rows = await pool.fetch(
            """SELECT id, dataset_id, source_chat_id, source_user_message_id,
                      source_assistant_message_id, input_text, expected_output_text,
                      tags_json, metadata_json, created_at
               FROM training_examples
               ORDER BY created_at DESC LIMIT $1""",
            capped_limit,
        )
    return [_example_from_row(r) for r in rows]


async def create_example(
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
    pool = await get_pool()
    eid = str(uuid.uuid4())
    await pool.execute(
        """INSERT INTO training_examples
             (id, dataset_id, source_chat_id, source_user_message_id,
              source_assistant_message_id, input_text, expected_output_text,
              tags_json, metadata_json)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)""",
        eid, dataset_id, source_chat_id, source_user_message_id,
        source_assistant_message_id, input_text, expected_output_text,
        json.dumps(tags) if tags else None,
        json.dumps(metadata) if metadata else None,
    )
    row = await pool.fetchrow(
        """SELECT id, dataset_id, source_chat_id, source_user_message_id,
                  source_assistant_message_id, input_text, expected_output_text,
                  tags_json, metadata_json, created_at
           FROM training_examples WHERE id = $1""",
        eid,
    )
    if row is None:
        raise RuntimeError("Example insert succeeded but row not found")
    return _example_from_row(row)


# ---- App events ----

async def record_event(
    event_type: str,
    severity: str,
    request_id: str | None = None,
    message: str | None = None,
    properties: dict[str, Any] | None = None,
) -> None:
    pool = await get_pool()
    await pool.execute(
        """INSERT INTO app_events (request_id, event_type, severity, message, properties_json)
           VALUES ($1, $2, $3, $4, $5)""",
        request_id, event_type, severity, message,
        json.dumps(properties) if properties else None,
    )
