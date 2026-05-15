from __future__ import annotations

from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse

from app.db.repository import get_repository
from app.models import CreateDatasetRequest, CreateExampleRequest
from app.services.training_service import stream_export_jsonl

router = APIRouter()


@router.get("/api/training/datasets")
async def list_datasets():
    datasets = await get_repository().list_datasets()
    return {"datasets": [d.model_dump() for d in datasets]}


@router.post("/api/training/datasets", status_code=201)
async def create_dataset(body: CreateDatasetRequest):
    dataset = await get_repository().create_dataset(body.name, body.description)
    return dataset.model_dump()


@router.get("/api/training/examples")
async def list_examples(
    datasetId: str | None = Query(default=None),
    limit: int | None = Query(default=None),
):
    effective_limit = limit if limit and limit > 0 else 1000
    examples = await get_repository().list_examples(dataset_id=datasetId, limit=effective_limit)
    return {"examples": [e.model_dump() for e in examples]}


@router.post("/api/training/examples", status_code=201)
async def create_example(body: CreateExampleRequest):
    example = await get_repository().create_example(
        body.inputText,
        body.expectedOutputText,
        dataset_id=body.datasetId,
        source_chat_id=body.sourceChatId,
        source_user_message_id=body.sourceUserMessageId,
        source_assistant_message_id=body.sourceAssistantMessageId,
        tags=body.tags,
        metadata=body.metadata,
    )
    return example.model_dump()


@router.get("/api/training/export.jsonl")
async def export_jsonl(datasetId: str | None = Query(default=None)):
    return StreamingResponse(
        stream_export_jsonl(dataset_id=datasetId),
        media_type="application/jsonl; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="training-examples.jsonl"'},
    )
