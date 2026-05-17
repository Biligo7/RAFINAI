"""Fetch current weather and short-term forecast from OpenWeatherMap."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

import httpx

from app.config import settings
from app.logging import get_logger

logger = get_logger("services.weather")

_OWM_CURRENT_URL = "https://api.openweathermap.org/data/2.5/weather"
_OWM_FORECAST_URL = "https://api.openweathermap.org/data/2.5/forecast"


async def fetch_weather(lat: float, lng: float) -> dict[str, Any] | None:
    """Fetch current weather + 3-hour forecast blocks for a location."""
    if not settings.openweather_api_key:
        await logger.awarning("OpenWeatherMap API key not set — skipping")
        return None

    params = {
        "lat": lat,
        "lon": lng,
        "appid": settings.openweather_api_key,
        "units": "metric",
    }

    async with httpx.AsyncClient(timeout=15) as client:
        current_resp = await client.get(_OWM_CURRENT_URL, params=params)
        if current_resp.status_code == 429:
            await logger.awarning("OpenWeatherMap rate limit hit")
            return None
        current_resp.raise_for_status()
        current = current_resp.json()

        forecast_resp = await client.get(_OWM_FORECAST_URL, params={**params, "cnt": 8})
        forecast_resp.raise_for_status()
        forecast = forecast_resp.json()

    weather_main = current.get("weather", [{}])[0]
    wind = current.get("wind", {})
    main_data = current.get("main", {})

    next_rain = False
    for block in forecast.get("list", []):
        cond = block.get("weather", [{}])[0].get("main", "")
        if cond.lower() in ("rain", "drizzle", "thunderstorm"):
            next_rain = True
            break

    return {
        "condition": weather_main.get("main", "Clear"),
        "description": weather_main.get("description", ""),
        "temp_c": main_data.get("temp"),
        "feels_like_c": main_data.get("feels_like"),
        "humidity": main_data.get("humidity"),
        "wind_speed_ms": wind.get("speed"),
        "wind_gust_ms": wind.get("gust"),
        "clouds_pct": current.get("clouds", {}).get("all", 0),
        "rain_next_24h": next_rain,
        "icon": weather_main.get("icon", "01d"),
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }


def weather_to_safety(weather: dict[str, Any]) -> dict[str, Any]:
    """Convert weather data to a safety status + label (matches frontend Trail.safety)."""
    condition = (weather.get("condition") or "").lower()
    temp = weather.get("temp_c") or 20
    wind = weather.get("wind_speed_ms") or 0
    rain_soon = weather.get("rain_next_24h", False)

    if condition in ("thunderstorm",) or wind > 15:
        status = "warning"
        label = f"Warning: {weather.get('description', 'severe weather')} · {temp:.0f}°C, wind {wind:.0f} m/s"
    elif condition in ("rain", "drizzle") or rain_soon or wind > 10:
        status = "caution"
        desc = weather.get("description", "rain expected")
        label = f"Caution: {desc} · {temp:.0f}°C"
    else:
        status = "safe"
        desc = weather.get("description", "clear skies")
        label = f"{desc.capitalize()} · {temp:.0f}°C"

    return {"status": status, "label": label}


async def get_cached_weather(pool, trail_id: str) -> dict[str, Any] | None:
    """Return cached weather if fresh enough."""
    row = await pool.fetchrow(
        "SELECT weather_json, fetched_at FROM cached_weather WHERE trail_id = $1",
        trail_id,
    )
    if not row:
        return None
    age = (datetime.now(timezone.utc) - row["fetched_at"].replace(tzinfo=timezone.utc)).total_seconds()
    if age > settings.weather_cache_ttl:
        return None
    return json.loads(row["weather_json"]) if isinstance(row["weather_json"], str) else dict(row["weather_json"])


async def upsert_cached_weather(pool, trail_id: str, weather: dict[str, Any]) -> None:
    """Insert or update the weather cache for a trail."""
    await pool.execute(
        """INSERT INTO cached_weather (trail_id, weather_json, fetched_at)
           VALUES ($1, $2, now())
           ON CONFLICT (trail_id) DO UPDATE SET
             weather_json = EXCLUDED.weather_json,
             fetched_at = EXCLUDED.fetched_at""",
        trail_id, json.dumps(weather),
    )
