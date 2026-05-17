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

    # Strategy 1: Inject cached trail catalog for passive context
    trail_context = await _build_trail_context()
    if trail_context:
        system_prompt += trail_context

    # Strategy 2: Per-query live grounding pipeline
    grounding_context = ""
    user_input_lower = user_message.content.lower() if user_message and user_message.content else ""

    detected_location = None
    overtourism_redirect = False

    sustainability_alert = evaluate_sustainability_constraints(user_input_lower)

    if sustainability_alert and sustainability_alert["is_overrun"]:
        grounding_context += (
            f"\n[SUSTAINABILITY CONSTRAINT ACTIVATED]:\n"
            f"- Region: {sustainability_alert['region_name']}\n"
            f"- Eurostat Tourism Intensity: {sustainability_alert['tourism_intensity_score']} nights/capita\n"
            f"- Water Stress Rating: {sustainability_alert['water_stress_index']}/100\n"
            f"- Infrastructural Load: {sustainability_alert['infrastructure_strain']}/100\n"
            f"- Environmental Assessment: {sustainability_alert['educational_rationale']}\n"
            f"- MANDATORY POLICY ACTION: Warmly inform the user about these environmental statistics "
            f"and dynamically pivot their interest to our verified sustainable alternative: {sustainability_alert['alternative_pivot']}."
        )
        detected_location = sustainability_alert["alternative_pivot"].split(" ")[0]
        overtourism_redirect = True

    if not overtourism_redirect:
        trigger_keywords = ["hike", "climb", "visit", "trail", "near", "in", "at", "about", "for", "weather"]
        words = user_message.content.split() if user_message and user_message.content else []

        for i, word in enumerate(words):
            clean_word = word.lower().strip("?,.!")
            if clean_word in trigger_keywords and i + 1 < len(words):
                potential_entity = " ".join([w.strip("?,.!") for w in words[i+1:i+3]])
                if potential_entity.lower() not in ["a", "the", "it", "this", "my", "your"]:
                    detected_location = potential_entity
                    break

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
        try:
            from app.services.hikers_data import (
                fetch_location_coordinates,
                fetch_live_weather,
                fetch_osm_trails,
                fetch_ors_routing,
                fetch_inaturalist_biodiversity,
                fetch_reddit_trail_reports,
            )

            logger.info("executing.complete.makeathon.pipeline", chat_id=chat_id, location=detected_location)
            coordinates = await fetch_location_coordinates(detected_location)

            if coordinates:
                lat, lon = coordinates
                weather = await fetch_live_weather(lat, lon)
                trails = await fetch_osm_trails(detected_location)
                routing = await fetch_ors_routing(lat, lon)
                fauna = await fetch_inaturalist_biodiversity(lat, lon)
                reddit_reports = await fetch_reddit_trail_reports(detected_location)

                grounding_context += f"\n[AUTOMATED REAL-TIME GROUNDING MATRIX FOR: {detected_location.upper()}]:\n"
                grounding_context += f"- Geographic Coordinates: Latitude {lat}, Longitude {lon}\n"
                grounding_context += f"- Current Safety Conditions: {weather['temp']}°C, {weather['condition']}\n"
                grounding_context += f"- Wind Velocity: {weather['wind_speed']} m/s\n"
                grounding_context += (
                    f"- Route Profiles: Total Distance = {routing['distance_km']} km | "
                    f"Est. Duration = {routing['duration_mins']} mins | "
                    f"Net Elevation Ascent = +{routing['ascent_m']} m\n"
                )

                if fauna:
                    grounding_context += f"- Local Ecosystem Observations (iNaturalist): Native species spotted near trail: {', '.join(str(f) for f in fauna)}\n"

                if reddit_reports:
                    grounding_context += "- Recent Community Field Intelligence (Reddit/Forums):\n"
                    for report in reddit_reports:
                        grounding_context += f"  * Live Forum Log: \"{report}\"\n"

                if not weather.get("is_safe", True):
                    grounding_context += (
                        "\n[CRITICAL SAFETY WARNING]: Extreme weather/wind vectors detected for this trek. "
                        "You MUST issue a prominent, clear safety warning and recommend avoiding this route right now.\n"
                    )
                else:
                    grounding_context += "- Route Safety Clearance: Weather verified stable for hiking.\n"

                if trails:
                    grounding_context += "\n[VERIFIED OPENSTREETMAP TRACKS FOR REGION]:\n"
                    for idx, trail in enumerate(trails[:3]):
                        t_name = trail.get("name", f"Local path near {detected_location}")
                        t_diff = trail.get("difficulty", "Moderate")
                        t_id = trail.get("id") or str(t_name.lower().replace(" ", "-"))
                        grounding_context += f"  * Path {idx+1}: Name='{t_name}' (ID: '{t_id}', Difficulty: '{t_diff}')\n"

        except Exception as err:
            logger.error("automated.grounding.pipeline.failed", error=str(err), chat_id=chat_id)

    if grounding_context:
        system_prompt += f"\n\nCore Reality Context Matrix:{grounding_context}\n"

    system_prompt += (
        "\n\n[CRITICAL GROUNDING DIRECTIVES]:"
        "\n1. You MUST explicitly quote the exact weather numbers (temp, condition, wind) provided in the 'Core Reality Context Matrix'."
        "\n2. You MUST state the exact route distance (km), duration, and elevation ascent numbers from OpenRouteService."
        "\n3. You MUST state the precise iNaturalist plant/animal species names provided in the context matrix."
        "\n4. Do NOT use general phrases like 'check weather forecasts before your hike'. State what the live weather reads right now."
        "\n5. When referencing any trail path, you MUST append its exact string token marker in the precise format [[trails:TRAIL_ID]] at the absolute end of your speech bubble so the user's interactive map functions instantly."
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


async def _build_trail_context() -> str:
    """Build a compact trail + weather summary to inject into the system prompt."""
    if settings.trail_source == "mock":
        return ""
    try:
        from app.db.pool import get_pool
        from app.services.weather import get_cached_weather, weather_to_safety

        pool = await get_pool()
        rows = await pool.fetch(
            "SELECT id, name, region, difficulty, length_km, elevation_m FROM cached_trails ORDER BY name LIMIT 30"
        )
        if not rows:
            return ""

        lines = [
            "\n\n## Available Greek Trails (live from OpenStreetMap)",
            "When the user asks for trail recommendations, prefer trails from this catalog. "
            "Reference them with [[trails:ID]] markers so the UI renders trail cards.",
        ]
        for r in rows:
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
