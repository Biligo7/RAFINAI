"""Trail catalog endpoints — powered by OSM, ORS, and OpenWeatherMap.

Combines two approaches:
- Cached catalog: bulk-fetched from OSM, stored in Postgres, enriched in background
- Live telemetry: per-request weather/routing/biodiversity lookup by location name
"""

from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query

from app.config import settings
from app.db.pool import get_pool
from app.logging import get_logger
from app.services.osm import (
    fetch_trails_from_osm,
    get_cached_trail,
    upsert_cached_trails,
)
from app.services.routing import fetch_route_for_trail, update_trail_route
from app.services.weather import (
    fetch_weather,
    get_cached_weather,
    upsert_cached_weather,
    weather_to_safety,
)

logger = get_logger("routes.trails")
router = APIRouter(prefix="/api/trails", tags=["trails"])

_REGION_IMAGES: dict[str, str] = {
    "crete": "https://images.unsplash.com/photo-1601581875309-fafbf2d3ed3a?w=800&q=70&auto=format&fit=crop",
    "peloponnese": "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800&q=70&auto=format&fit=crop",
    "epirus": "https://images.unsplash.com/photo-1508739773434-c26b3d09e071?w=800&q=70&auto=format&fit=crop",
    "thessaly": "https://images.unsplash.com/photo-1448375240586-882707db888b?w=800&q=70&auto=format&fit=crop",
    "macedonia": "https://images.unsplash.com/photo-1486870591958-9b9d0d1dda99?w=800&q=70&auto=format&fit=crop",
    "cyclades": "https://images.unsplash.com/photo-1533105079780-92b9be482077?w=800&q=70&auto=format&fit=crop",
    "dodecanese": "https://images.unsplash.com/photo-1533105079780-92b9be482077?w=800&q=70&auto=format&fit=crop",
    "ionian": "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800&q=70&auto=format&fit=crop",
    "attica": "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800&q=70&auto=format&fit=crop",
    "thrace": "https://images.unsplash.com/photo-1486870591958-9b9d0d1dda99?w=800&q=70&auto=format&fit=crop",
}
_DEFAULT_IMAGE = "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800&q=70&auto=format&fit=crop"


def _pick_image(region: str) -> str:
    region_lower = region.lower()
    for keyword, url in _REGION_IMAGES.items():
        if keyword in region_lower:
            return url
    return _DEFAULT_IMAGE


def _trail_to_api(row: dict, weather: dict | None = None) -> dict:
    """Convert a cached_trails DB row to the shape the frontend expects."""
    route_raw = row.get("route")
    if isinstance(route_raw, str):
        route = json.loads(route_raw)
    elif isinstance(route_raw, list):
        route = route_raw
    else:
        route = []

    waypoints_raw = row.get("waypoints", "[]")
    if isinstance(waypoints_raw, str):
        waypoints = json.loads(waypoints_raw)
    elif isinstance(waypoints_raw, list):
        waypoints = waypoints_raw
    else:
        waypoints = []

    region = row.get("region", "Greece")
    safety = weather_to_safety(weather) if weather else {"status": "safe", "label": "Weather data loading…"}

    return {
        "id": row["id"],
        "osmId": row.get("osm_id"),
        "name": row["name"],
        "region": region,
        "lat": row["lat"],
        "lng": row["lng"],
        "difficulty": row.get("difficulty", "Moderate"),
        "lengthKm": row.get("length_km", 0),
        "elevationM": row.get("elevation_m", 0),
        "durationH": row.get("duration_h", 0),
        "blurb": row.get("blurb", ""),
        "route": route,
        "waypoints": waypoints,
        "sustainability": 8.0,
        "sustainabilityNote": "Community-maintained trail",
        "safety": safety,
        "image": _pick_image(region),
        "vibe": row.get("blurb", "")[:80] or f"Hiking trail in {region}",
        "alternativeTo": None,
        "safetyStatus": safety["status"],
        "safetyLabel": safety["label"],
        "rainAlternativeId": "",
        "weather": weather,
    }


async def _enrich_trails_background(trail_ids: list[str]) -> None:
    """Background task: fetch ORS routes and weather for trails that lack them."""
    pool = await get_pool()
    route_count = 0
    weather_count = 0

    for trail_id in trail_ids:
        row = await get_cached_trail(pool, trail_id)
        if not row:
            continue

        if not row.get("route") and settings.ors_api_key and route_count < 10:
            try:
                route_data = await fetch_route_for_trail(
                    lat=row["lat"], lng=row["lng"],
                    length_km=row.get("length_km") or 5.0,
                )
                if route_data:
                    await update_trail_route(pool, trail_id, route_data)
                    route_count += 1
                await asyncio.sleep(0.5)
            except Exception:
                await logger.aexception("Background route fetch failed", trail_id=trail_id)

        cached_w = await get_cached_weather(pool, trail_id)
        if not cached_w and settings.openweather_api_key and weather_count < 15:
            try:
                weather = await fetch_weather(row["lat"], row["lng"])
                if weather:
                    await upsert_cached_weather(pool, trail_id, weather)
                    weather_count += 1
                await asyncio.sleep(0.3)
            except Exception:
                await logger.aexception("Background weather fetch failed", trail_id=trail_id)

    await logger.ainfo(
        "Background enrichment done",
        routes_fetched=route_count,
        weather_fetched=weather_count,
    )


# ── Catalog endpoints (cached from OSM) ────────────────────────────────

@router.get("")
async def list_trails(
    background_tasks: BackgroundTasks,
    popular_only: bool = Query(True, description="Limit to popular trails"),
    refresh: bool = Query(False, description="Force re-fetch from OSM"),
    region: str | None = Query(None, description="Filter by region substring"),
    difficulty: str | None = Query(None, description="Filter by difficulty"),
    limit: int = Query(200, ge=1, le=2000),
):
    if settings.trail_source == "mock":
        return {"trails": [], "source": "mock"}

    pool = await get_pool()

    count_row = await pool.fetchrow("SELECT count(*) as c FROM cached_trails")
    has_cache = count_row and count_row["c"] > 0

    if not has_cache or refresh:
        try:
            osm_trails = await fetch_trails_from_osm()
            if osm_trails:
                await upsert_cached_trails(pool, osm_trails)
                await logger.ainfo("Trail cache refreshed from OSM", count=len(osm_trails))
        except Exception:
            await logger.aexception("Failed to fetch trails from OSM")
            if not has_cache:
                raise HTTPException(status_code=503, detail="Trail data temporarily unavailable")

    if popular_only:
        limit = min(limit, 25)

    conditions: list[str] = ["lat >= 34.5", "lat <= 42.0", "lng >= 19.3", "lng <= 30.0"]
    params: list = []
    idx = 1

    if region:
        conditions.append(f"LOWER(region) LIKE LOWER(${idx})")
        params.append(f"%{region}%")
        idx += 1
    if difficulty:
        conditions.append(f"difficulty = ${idx}")
        params.append(difficulty)
        idx += 1

    where = (" WHERE " + " AND ".join(conditions)) if conditions else ""
    query = f"SELECT * FROM cached_trails{where} ORDER BY name LIMIT ${idx}"
    params.append(limit)

    rows = await pool.fetch(query, *params)

    trails_api = []
    enrich_ids = []
    for r in rows:
        rd = dict(r)
        weather = await get_cached_weather(pool, rd["id"])
        trails_api.append(_trail_to_api(rd, weather))
        if not weather or not rd.get("route"):
            enrich_ids.append(rd["id"])

    if enrich_ids:
        background_tasks.add_task(_enrich_trails_background, enrich_ids[:20])

    total_in_db = await pool.fetchrow("SELECT count(*) as c FROM cached_trails")
    return {
        "trails": trails_api,
        "source": "osm",
        "total": len(trails_api),
        "totalInDb": total_in_db["c"] if total_in_db else 0,
    }


@router.get("/{trail_id}")
async def get_trail(trail_id: str, background_tasks: BackgroundTasks):
    if settings.trail_source == "mock":
        raise HTTPException(status_code=404, detail="Not found (mock mode)")

    pool = await get_pool()
    row = await get_cached_trail(pool, trail_id)
    if not row:
        raise HTTPException(status_code=404, detail="Trail not found")

    weather = await get_cached_weather(pool, trail_id)
    trail = _trail_to_api(row, weather)

    if not weather or not row.get("route"):
        background_tasks.add_task(_enrich_trails_background, [trail_id])

    return trail


@router.post("/{trail_id}/route")
async def compute_route(trail_id: str):
    """Fetch or refresh the ORS route for a trail."""
    pool = await get_pool()
    row = await get_cached_trail(pool, trail_id)
    if not row:
        raise HTTPException(status_code=404, detail="Trail not found")

    route_data = await fetch_route_for_trail(
        lat=row["lat"], lng=row["lng"],
        length_km=row.get("length_km") or 5.0,
    )
    if not route_data:
        raise HTTPException(status_code=503, detail="Route service unavailable (check ORS_API_KEY)")

    await update_trail_route(pool, trail_id, route_data)
    updated = await get_cached_trail(pool, trail_id)
    return _trail_to_api(updated) if updated else _trail_to_api(row)


@router.get("/{trail_id}/weather")
async def get_trail_weather(trail_id: str):
    """Return weather for a trail, with caching."""
    pool = await get_pool()
    row = await get_cached_trail(pool, trail_id)
    if not row:
        raise HTTPException(status_code=404, detail="Trail not found")

    weather = await get_cached_weather(pool, trail_id)
    if weather:
        return {"weather": weather, "safety": weather_to_safety(weather), "cached": True}

    weather = await fetch_weather(row["lat"], row["lng"])
    if not weather:
        raise HTTPException(status_code=503, detail="Weather service unavailable (check OPENWEATHER_API_KEY)")

    await upsert_cached_weather(pool, trail_id, weather)
    return {"weather": weather, "safety": weather_to_safety(weather), "cached": False}


@router.post("/refresh")
async def refresh_trails():
    """Admin endpoint to force a full OSM re-fetch."""
    pool = await get_pool()
    try:
        osm_trails = await fetch_trails_from_osm()
        if osm_trails:
            await upsert_cached_trails(pool, osm_trails)
        return {"refreshed": len(osm_trails), "source": "osm"}
    except Exception as exc:
        await logger.aexception("Failed to refresh trail cache")
        raise HTTPException(status_code=503, detail=str(exc)) from exc


# ── Live telemetry endpoint (per-request lookup by location name) ───────

@router.get("/{location_name}/telemetry")
async def get_live_trail_telemetry(location_name: str):
    """Fetches real-time weather, routing, and biodiversity for a named location."""
    from app.services.hikers_data import (
        fetch_location_coordinates,
        fetch_live_weather,
        fetch_ors_routing,
        fetch_inaturalist_biodiversity,
    )

    coords = await fetch_location_coordinates(location_name)
    if not coords:
        raise HTTPException(status_code=404, detail="Location not found")

    lat, lon = coords
    weather = await fetch_live_weather(lat, lon)
    routing = await fetch_ors_routing(lat, lon)
    biodiversity = await fetch_inaturalist_biodiversity(lat, lon)

    api_waypoints = []
    for idx, species in enumerate(biodiversity):
        api_waypoints.append({
            "kind": "biodiversity",
            "name": species.get("name", str(species)) if isinstance(species, dict) else str(species),
            "lat": (species.get("lat", lat + (idx + 1) * 0.003)) if isinstance(species, dict) else lat + (idx + 1) * 0.003,
            "lng": (species.get("lng", lon - (idx + 1) * 0.003)) if isinstance(species, dict) else lon - (idx + 1) * 0.003,
        })

    return {
        "location": location_name,
        "lat": lat,
        "lng": lon,
        "weather": weather,
        "routing": routing,
        "geometry": routing.get("geometry", []),
        "waypoints": api_waypoints,
    }
