"""Chat completion orchestration — streams tokens from the AI provider.

Combines two context-enrichment strategies:
1. Cached trail catalog: injected into system prompt from Postgres cache
2. Per-query live grounding: AI extracts location → live weather/routing/biodiversity
"""

from __future__ import annotations

import time
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from app.config import settings
from app.db.repository import get_repository
from app.logging import get_logger
from app.models import ImageAttachment, Message
from app.services.ai.base import ChatCompletionMessage
from app.services.ai.client import get_ai_provider
from app.services.sustainability import evaluate_sustainability_constraints

logger = get_logger("services.chat")


@dataclass
class StreamingChatResult:
    assistant_message_id: str
    full: str
    latency_ms: int


async def extract_location_with_ai(user_input: str, provider, request_id: str) -> str | None:
    """Extracts a Greek geographic entity from user input.
    Uses mock heuristics in mock mode, real LLM NER in production.
    """
    clean_input = user_input.lower().strip()

    if settings.ai_provider == "mock":
        if any(x in clean_input for x in ["olympus", "olymi", "olimbos"]):
            return "Mount Olympus"
        elif "metsovo" in clean_input:
            return "Metsovo"
        elif "zagori" in clean_input:
            return "Zagori"
        elif "crete" in clean_input:
            return "Crete"
        return None

    extraction_prompt = (
        "You are a strict geographic entity extraction utility for a Greek hiking application. "
        "Identify the main mountain, town, or trail network. Fix abbreviations (e.g. 'Mt. Olympus' -> 'Mount Olympus'). "
        "Output ONLY the raw clean name, or 'None'."
    )

    try:
        messages = [
            ChatCompletionMessage(role="system", content=extraction_prompt),
            ChatCompletionMessage(role="user", content=f"Extract from: {user_input}")
        ]

        raw_response = await _get_chat_completion(
            provider,
            messages=messages,
            model=settings.ai_model,
            temperature=0.0,
            max_tokens=20,
            request_id=request_id,
        )

        clean_result = raw_response.strip().replace('"', '').replace("'", "")
        if clean_result.lower() == "none" or not clean_result:
            return None
        return clean_result
    except Exception as e:
        logger.error("ai.location.extraction.failed", error=str(e))
        return None


async def _get_chat_completion(
    provider,
    *,
    messages: list[ChatCompletionMessage],
    model: str,
    temperature: float,
    max_tokens: int,
    request_id: str,
) -> str:
    output = ""
    async for token in provider.stream_chat_completion(
        messages=messages,
        model=model,
        temperature=temperature,
        max_tokens=max_tokens,
        request_id=request_id,
    ):
        output += token
    return output


async def generate_chat_response(
    *,
    chat_id: str,
    user_id: str,
    user_message: Message,
    image_attachments: list[ImageAttachment] | None = None,
    request_id: str,
    on_assistant_start: Callable[[str], Any],
    on_token: Callable[[str], Any],
) -> StreamingChatResult:
    repo = get_repository()
    provider = get_ai_provider()

    chat = await repo.get_chat(chat_id, user_id)
    if chat is None:
        raise RuntimeError(f"Chat {chat_id} not found")

    history = await repo.list_messages(chat_id, user_id)

    system_prompt = chat.systemPrompt or settings.ai_system_prompt

    if user_id:
        user_prefs = await repo.get_user_preferences(user_id)
        if user_prefs and user_prefs["preferences_text"]:
            system_prompt += (
                "\n\n## User Preferences\n"
                "The following are personal preferences shared by this user. "
                "Use them to personalize your recommendations:\n"
                + user_prefs["preferences_text"]
            )

    # Extract location from user message for location-aware context
    user_input_lower = user_message.content.lower() if user_message and user_message.content else ""
    detected_location = None
    overtourism_redirect = False
    grounding_context = ""

    sustainability_alert = evaluate_sustainability_constraints(user_input_lower)
    if sustainability_alert and sustainability_alert["is_overrun"]:
        grounding_context += (
            f"\n[SUSTAINABILITY CONSTRAINT]:\n"
            f"- Region: {sustainability_alert['region_name']}\n"
            f"- Tourism Intensity: {sustainability_alert['tourism_intensity_score']} nights/capita\n"
            f"- Water Stress: {sustainability_alert['water_stress_index']}/100\n"
            f"- Infrastructure Strain: {sustainability_alert['infrastructure_strain']}/100\n"
            f"- Assessment: {sustainability_alert['educational_rationale']}\n"
            f"- ACTION: Warmly inform the user and pivot to: {sustainability_alert['alternative_pivot']}."
        )
        detected_location = sustainability_alert["alternative_pivot"].split(" ")[0]
        overtourism_redirect = True

    if not overtourism_redirect:
        detected_location = await extract_location_with_ai(
            user_message.content,
            provider,
            request_id,
        )

    if detected_location:
        detected_location = (
            detected_location
            .replace("Mountain", "Mount")
            .replace("mountain", "Mount")
            .replace("Mt.", "Mount")
            .replace("mt.", "Mount")
            .strip()
        )

    # Inject cached trail catalog — location-aware when possible
    trail_context = await _build_trail_context(detected_location)
    if trail_context:
        system_prompt += trail_context

    # Live grounding: weather for the detected location
    if detected_location:
        try:
            from app.services.hikers_data import (
                fetch_location_coordinates,
                fetch_live_weather,
            )
            logger.info("live.grounding", chat_id=chat_id, location=detected_location)
            coordinates = await fetch_location_coordinates(detected_location)
            if coordinates:
                lat, lon = coordinates
                weather = await fetch_live_weather(lat, lon)
                grounding_context += f"\n[LIVE CONDITIONS FOR {detected_location.upper()}]:\n"
                grounding_context += f"- Coordinates: {lat}, {lon}\n"
                grounding_context += f"- Weather: {weather['temp']}°C, {weather['condition']}, wind {weather['wind_speed']} m/s\n"
                if not weather.get("is_safe", True):
                    grounding_context += "- WARNING: Unsafe weather — advise the user against hiking right now.\n"
                else:
                    grounding_context += "- Conditions are safe for hiking.\n"
        except Exception as err:
            logger.error("live.grounding.failed", error=str(err), chat_id=chat_id)

    if grounding_context:
        system_prompt += f"\n\n{grounding_context}\n"

    system_prompt += (
        "\n\n[RESPONSE RULES]:"
        "\n1. If live weather data is provided above, quote the exact numbers (temp, wind)."
        "\n2. When recommending a trail, use ONLY trails from the 'Available Trails' list above."
        "\n3. For each trail you recommend, append its ID marker in the format [[trails:TRAIL_ID]] at the end of your response."
        "\n4. Do NOT invent trail names or IDs that are not in the list."
        "\n5. If the user asks about a specific area, recommend trails from that area. Do not default to unrelated regions."
    )

    recent = history[-settings.ai_max_history_messages:]
    messages: list[ChatCompletionMessage] = [
        ChatCompletionMessage(role="system", content=system_prompt),
    ]
    for m in recent:
        if m.role in ("user", "assistant"):
            content = (
                _with_image_parts(m.content, image_attachments)
                if m.id == user_message.id and image_attachments
                else m.content
            )
            messages.append(ChatCompletionMessage(role=m.role, content=content))

    while _total_chars(messages) > settings.ai_max_input_chars and len(messages) > 2:
        messages.pop(1)

    assistant_message_id = str(uuid.uuid4())
    on_assistant_start(assistant_message_id)

    start = time.monotonic()
    full = ""
    chat_model = settings.resolved_chat_model

    try:
        async for token in provider.stream_chat_completion(
            messages=messages,
            model=chat_model,
            temperature=settings.ai_temperature,
            max_tokens=settings.ai_max_tokens,
            request_id=request_id,
        ):
            full += token
            on_token(token)
    except Exception as exc:
        latency_ms = int((time.monotonic() - start) * 1000)
        logger.exception(
            "AI provider error",
            request_id=request_id,
            chat_id=chat_id,
            latency_ms=latency_ms,
            error_type=type(exc).__name__,
            error_message=str(exc),
        )
        try:
            await repo.insert_message(
                chat_id, "assistant", full,
                message_id=assistant_message_id,
                provider=provider.name,
                model=chat_model,
                latency_ms=latency_ms,
                error_code="AI_PROVIDER_ERROR",
            )
        except Exception:
            logger.error("Failed to persist failed assistant message")
        raise

    # Append trail marker if the LLM forgot to include one
    if "[[trails:" not in full and detected_location:
        try:
            from app.services.hikers_data import fetch_live_osm_trails_network
            live_network = await fetch_live_osm_trails_network(popular_only=False)
            normalized = detected_location.lower()
            matched_ids = []
            for t in live_network:
                if normalized in t.get("name", "").lower() or normalized in t.get("region", "").lower():
                    matched_ids.append(t["id"])
                    break
            if not matched_ids and live_network:
                matched_ids.append(live_network[0]["id"])
            if matched_ids:
                appended_token = f"\n\n[[trails:{','.join(matched_ids)}]]"
                full += appended_token
                on_token(appended_token)
        except Exception:
            pass

    latency_ms = int((time.monotonic() - start) * 1000)
    await repo.insert_message(
        chat_id, "assistant", full,
        message_id=assistant_message_id,
        provider=provider.name,
        model=chat_model,
        latency_ms=latency_ms,
    )

    logger.info(
        "chat.completion.completed",
        request_id=request_id,
        chat_id=chat_id,
        provider=provider.name,
        model=chat_model,
        latency_ms=latency_ms,
    )

    return StreamingChatResult(
        assistant_message_id=assistant_message_id,
        full=full,
        latency_ms=latency_ms,
    )


def _total_chars(messages: list[ChatCompletionMessage]) -> int:
    total = 0
    for message in messages:
        if isinstance(message.content, str):
            total += len(message.content)
        else:
            total += sum(len(str(part.get("text", ""))) for part in message.content)
    return total


async def _build_trail_context(location: str | None = None) -> str:
    """Build a compact trail summary for the system prompt.

    When a location is detected, prioritize trails matching that region/name.
    Always include a broader sample so the AI has alternatives to suggest.
    """
    if settings.trail_source == "mock":
        return ""
    try:
        from app.db.pool import get_pool
        from app.services.weather import get_cached_weather, weather_to_safety

        pool = await get_pool()

        local_rows: list = []
        if location:
            search = f"%{location}%"
            local_rows = await pool.fetch(
                "SELECT id, name, region, difficulty, length_km, elevation_m "
                "FROM cached_trails "
                "WHERE LOWER(name) LIKE LOWER($1) OR LOWER(region) LIKE LOWER($1) "
                "ORDER BY name LIMIT 15",
                search,
            )

        seen_ids = {r["id"] for r in local_rows}
        remaining = 20 - len(local_rows)
        if remaining > 0:
            global_rows = await pool.fetch(
                "SELECT id, name, region, difficulty, length_km, elevation_m "
                "FROM cached_trails ORDER BY RANDOM() LIMIT $1",
                remaining + 10,
            )
            for r in global_rows:
                if r["id"] not in seen_ids and len(local_rows) < 20:
                    local_rows.append(r)
                    seen_ids.add(r["id"])

        if not local_rows:
            return ""

        header = "\n\n## Available Trails"
        if location:
            header += f" (prioritizing: {location})"
        lines = [
            header,
            "Recommend trails ONLY from this list. Use [[trails:ID]] markers for each.",
        ]
        for r in local_rows:
            weather = await get_cached_weather(pool, r["id"])
            weather_note = ""
            if weather:
                safety = weather_to_safety(weather)
                weather_note = f" | Weather: {safety['label']}"
            lines.append(
                f"- **{r['name']}** ({r['region']}) — {r['difficulty']}, "
                f"{r['length_km']}km, +{r['elevation_m']}m | ID: {r['id']}{weather_note}"
            )
        return "\n".join(lines)
    except Exception:
        return ""


def _with_image_parts(content: str, images: list[ImageAttachment]) -> list[dict[str, Any]]:
    parts: list[dict[str, Any]] = [{"type": "text", "text": content}]
    for image in images:
        parts.append(
            {
                "type": "image_url",
                "image_url": {"url": image.dataUrl},
            },
        )
    return parts
