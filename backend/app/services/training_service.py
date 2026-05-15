"""Training data export as JSONL."""

from __future__ import annotations

import json
from collections.abc import AsyncIterator

from app.config import settings
from app.db.repository import get_repository
from app.models import TrainingExample


def example_to_jsonl(example: TrainingExample, system_prompt: str) -> str:
    record = {
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": example.inputText},
            {"role": "assistant", "content": example.expectedOutputText},
        ],
        "metadata": {
            "exampleId": example.id,
            "datasetId": example.datasetId,
            "sourceChatId": example.sourceChatId,
            "tags": example.tags,
        },
    }
    return json.dumps(record)


async def stream_export_jsonl(dataset_id: str | None = None) -> AsyncIterator[str]:
    repo = get_repository()
    examples = await repo.list_examples(dataset_id=dataset_id, limit=10_000)
    for example in examples:
        yield example_to_jsonl(example, settings.ai_system_prompt) + "\n"
