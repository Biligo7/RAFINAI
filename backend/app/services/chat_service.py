"""Chat completion orchestration — streams tokens from the AI provider."""

from __future__ import annotations

import asyncio
import time
import uuid
import json
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


async def extract_location_with_ai(user_input: str, provider, request_id: str) -> dict[str, Any] | None:
    """Extracts a Greek geographic entity and its search variants from user input."""
    if not user_input:
        return None

    clean_input = user_input.lower().strip()

    if settings.ai_provider == "mock":
        if any(x in clean_input for x in ["olympus", "olymi", "olimbos"]):
            return {"location": "Mount Olympus", "variants": ["Olympus", "Olimbos", "Olymbos"]}
        elif "metsovo" in clean_input:
            return {"location": "Metsovo", "variants": ["Metsovon", "Μέτσοβο"]}
        elif "ymittos" in clean_input or "hymettus" in clean_input:
            return {"location": "Mount Ymittos", "variants": ["Hymettus", "Hymettos", "Ymittos"]}
        return None

    extraction_prompt = (
        "You are a strict geographic entity extraction utility for a Greek hiking application. "
        "Identify the main mountain, town, or trail network. Fix abbreviations (e.g. 'Mt. Olympus' -> 'Mount Olympus'). "
        "Respond ONLY with a valid JSON object containing exactly two keys:\n"
        "- 'location': The standardized clean English name (or null if none found).\n"
        "- 'variants': A list of alternative spellings, historical names, shorthand terms, or native Greek names.\n"
        "Do not include markdown code block formatting. Output pure raw JSON text."
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
            max_tokens=150,
            request_id=request_id,
        )

        clean_result = raw_response.strip().replace("```json", "").replace("```", "").strip()
        data = json.loads(clean_result)
        
        if not data.get("location"):
            return None
            
        logger.info("ai.location.extraction.result", raw_input=user_input, extracted=data["location"], variants=data.get("variants", []))
        return {
            "location": str(data["location"]),
            "variants": list(data.get("variants", []))
        }
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
                + user_prefs["preferences_text"]
            )

    grounding_context = ""
    user_input_lower = user_message.content.lower() if user_message and user_message.content else ""
    detected_location = None
    search_variants = []
    overtourism_redirect = False
    local_trails_cache = []

    sustainability_alert = await asyncio.to_thread(evaluate_sustainability_constraints, user_input_lower)

    if sustainability_alert and sustainability_alert.get("is_overrun"):
        grounding_context += (
            f"\n[SUSTAINABILITY CONSTRAINT ACTIVATED]:\n"
            f"- Region: {sustainability_alert.get('region_name')}\n"
            f"- MANDATORY POLICY ACTION: Warmly inform the user about these environmental statistics..."
        )
        detected_location = sustainability_alert.get("alternative_pivot", "").split(" ")[0]
        search_variants = [detected_location]
        overtourism_redirect = True

    if not overtourism_redirect and user_message.content:
        extraction_data = await extract_location_with_ai(
            user_message.content,
            provider,
            request_id,
        )
        if extraction_data:
            detected_location = extraction_data["location"]
            search_variants = extraction_data["variants"]

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
                fetch_live_osm_trails_network,  # 🎯 SYNC FIX: Fetch the exact array the UI Map holds
                fetch_ors_routing,
                fetch_inaturalist_biodiversity,
                fetch_reddit_trail_reports,
            )

            logger.info("executing.complete.makeathon.pipeline", chat_id=chat_id, location=detected_location)
            coordinates = await fetch_location_coordinates(detected_location)

            if coordinates:
                lat, lon = coordinates
                
                results = await asyncio.gather(
                    fetch_live_weather(lat, lon),
                    fetch_live_osm_trails_network(popular_only=False), # 🎯 Fetch frontend map state
                    fetch_ors_routing(lat, lon),
                    fetch_inaturalist_biodiversity(lat, lon),
                    fetch_reddit_trail_reports(detected_location, search_variants),
                    return_exceptions=True
                )

                weather = results[0] if not isinstance(results[0], Exception) else {}
                all_map_trails = results[1] if not isinstance(results[1], Exception) else []
                routing = results[2] if not isinstance(results[2], Exception) else {}
                fauna = results[3] if not isinstance(results[3], Exception) else []
                reddit_reports = results[4] if not isinstance(results[4], Exception) else []
                
                # 🎯 THE SYNC FIX: Filter the global frontend map pins to just the ones near our coordinates!
                # This guarantees the AI only recommends a trail the React frontend actually knows about.
                local_trails_cache = [
                    t for t in all_map_trails
                    if abs(t["lat"] - lat) < 0.2 and abs(t["lng"] - lon) < 0.2
                ]

                grounding_context += f"\n[AUTOMATED REAL-TIME GROUNDING MATRIX FOR: {detected_location.upper()}]:\n"
                grounding_context += f"- Geographic Coordinates: Latitude {lat}, Longitude {lon}\n"
                
                if weather:
                    grounding_context += f"- Current Safety Conditions: {weather.get('temp', 'N/A')}°C, {weather.get('condition', 'N/A')}\n"

                if routing and routing.get('distance_km', 0) > 0:
                    grounding_context += (
                        f"- Route Profiles: Total Distance = {routing.get('distance_km', 'N/A')} km | "
                        f"Est. Duration = {routing.get('duration_mins', 'N/A')} mins\n"
                    )

                if fauna:
                    grounding_context += f"- Local Ecosystem Observations (iNaturalist): Native species spotted near trail: {', '.join(str(f) for f in fauna)}\n"

                if reddit_reports:
                    grounding_context += "- Recent Community Field Intelligence (Reddit/Forums):\n"
                    for report in reddit_reports:
                        grounding_context += f"  * Live Forum Log: \"{report}\"\n"

                if weather and not weather.get("is_safe", True):
                    grounding_context += "\n[CRITICAL SAFETY WARNING]: Extreme weather detected. Recommend avoiding this route.\n"

                if local_trails_cache:
                    grounding_context += "\n[VERIFIED FRONTEND MAP TRACKS FOR REGION]:\n"
                    for idx, trail in enumerate(local_trails_cache[:3]):
                        t_name = trail.get("name", f"Local path near {detected_location}")
                        t_diff = trail.get("difficulty", "Moderate")
                        t_id = trail.get("id")
                        grounding_context += f"  * Path {idx+1}: Name='{t_name}' (ID: '{t_id}', Difficulty: '{t_diff}')\n"

        except Exception as err:
            logger.error("automated.grounding.pipeline.failed", error=str(err), chat_id=chat_id)

    if not local_trails_cache and not overtourism_redirect:
        static_trail_context = await _build_trail_context()
        if static_trail_context:
            system_prompt += static_trail_context

    if grounding_context:
        system_prompt += f"\n\nCore Reality Context Matrix:{grounding_context}\n"

    system_prompt += (
        "\n\n[CRITICAL GROUNDING DIRECTIVES]:"
        "\n1. You MUST explicitly quote the exact weather numbers (temp, condition, wind) provided in the 'Core Reality Context Matrix'."
        "\n2. You MUST state the exact route distance (km) and elevation ascent numbers attached to the VERIFIED FRONTEND MAP TRACKS."
        "\n3. You MUST state the precise iNaturalist plant/animal species names provided."
        "\n4. When referencing any trail path, you MUST append its exact string token marker in the precise format [[trails:TRAIL_ID]] at the absolute end of your speech bubble so the user's interactive map functions instantly."
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
        logger.exception("AI provider error", error_type=type(exc).__name__)
        raise

    # 🎯 THE SYNC FIX: Guarantee the fallback only appends a map-verified ID
    if "[[trails:" not in full and local_trails_cache:
        try:
            t_id = local_trails_cache[0].get("id")
            if t_id:
                appended_token = f"\n\n[[trails:{t_id}]]"
                full += appended_token
                on_token(appended_token)
        except Exception as e:
            logger.error("fallback.trail.append.failed", error=str(e))

    latency_ms = int((time.monotonic() - start) * 1000)
    await repo.insert_message(
        chat_id, "assistant", full,
        message_id=assistant_message_id,
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
        if not message.content:
            continue
        if isinstance(message.content, str):
            total += len(message.content)
    return total

async def _build_trail_context() -> str:
    if settings.trail_source == "mock": return ""
    try:
        from app.db.pool import get_pool
        pool = await get_pool()
        rows = await pool.fetch("SELECT id, name, region, difficulty, length_km, elevation_m FROM cached_trails ORDER BY name LIMIT 30")
        if not rows: return ""
        lines = ["\n\n## Available Greek Trails (live from OpenStreetMap)"]
        for r in rows:
            lines.append(f"- **{r['name']}** ({r['region']}) | ID: {r['id']}")
        return "\n".join(lines)
    except Exception: return ""

def _with_image_parts(content: str, images: list[ImageAttachment]) -> list[dict[str, Any]]:
    parts: list[dict[str, Any]] = [{"type": "text", "text": content or ""}]
    return parts