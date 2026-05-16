"""Pydantic models matching the JSON shapes the frontend expects."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class Chat(BaseModel):
    id: str
    title: str
    systemPrompt: str | None = None
    model: str | None = None
    temperature: float | None = None
    archivedAt: str | None = None
    createdAt: str
    updatedAt: str


class Message(BaseModel):
    id: str
    chatId: str
    role: Literal["system", "user", "assistant", "tool"]
    content: str
    tokenCount: int | None = None
    provider: str | None = None
    model: str | None = None
    latencyMs: int | None = None
    errorCode: str | None = None
    metadata: dict[str, Any] | None = None
    createdAt: str


class MessageFeedback(BaseModel):
    id: str
    messageId: str
    rating: Literal[-1, 1]
    comment: str | None = None
    createdAt: str


class TrainingDataset(BaseModel):
    id: str
    name: str
    description: str | None = None
    createdAt: str
    updatedAt: str


class TrainingExample(BaseModel):
    id: str
    datasetId: str | None = None
    sourceChatId: str | None = None
    sourceUserMessageId: str | None = None
    sourceAssistantMessageId: str | None = None
    inputText: str
    expectedOutputText: str
    tags: list[str] | None = None
    metadata: dict[str, Any] | None = None
    createdAt: str


class AppConfigResponse(BaseModel):
    appName: str
    environment: str
    aiProvider: str
    model: str
    streamingEnabled: bool
    authEnabled: bool


class ApiErrorDetail(BaseModel):
    code: str
    message: str
    requestId: str


class ApiErrorBody(BaseModel):
    error: ApiErrorDetail


# --- Request bodies ---

class CreateChatRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=256)
    systemPrompt: str | None = Field(default=None, max_length=4000)


class PatchChatRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=256)
    systemPrompt: str | None = Field(default=None, max_length=4000)


class ImageAttachment(BaseModel):
    name: str | None = Field(default=None, max_length=256)
    mediaType: str = Field(..., pattern=r"^image/(png|jpeg|jpg|webp)$")
    dataUrl: str = Field(..., min_length=32, max_length=6_500_000)
    thumbnailDataUrl: str | None = Field(default=None, min_length=32, max_length=600_000)


class SendMessageRequest(BaseModel):
    content: str = Field(..., min_length=1)
    images: list[ImageAttachment] = Field(default_factory=list, max_length=3)
    temperature: float | None = Field(default=None, ge=0, le=2)
    systemPromptOverride: str | None = Field(default=None, max_length=4000)


class SaveMessageRequest(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(..., min_length=1)


class FeedbackRequest(BaseModel):
    rating: Literal[-1, 1]
    comment: str | None = Field(default=None, max_length=4000)


class CreateDatasetRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=256)
    description: str | None = Field(default=None, max_length=4000)


class CreateExampleRequest(BaseModel):
    datasetId: str | None = None
    sourceChatId: str | None = None
    sourceUserMessageId: str | None = None
    sourceAssistantMessageId: str | None = None
    inputText: str = Field(..., min_length=1, max_length=32_000)
    expectedOutputText: str = Field(..., min_length=1, max_length=32_000)
    tags: list[str] | None = None
    metadata: dict[str, Any] | None = None

class TrailResponse(BaseModel):
    id: str
    name: str
    region: str
    lat: float
    lng: float
    difficulty: str
    lengthKm: float
    elevationM: int
    durationH: int
    vibe: str
    blurb: str
    alternativeTo: str | None = None
    image: str
    sustainability: float
    sustainabilityNote: str
    safetyStatus: str
    safetyLabel: str
    rainAlternativeId: str | None = None
