"""Fetch hiking route polylines and elevation from OpenRouteService."""

from __future__ import annotations

import json
from typing import Any

import httpx

from app.config import settings
from app.logging import get_logger

logger = get_logger("services.routing")

_ORS_DIRECTIONS_URL = "https://api.openrouteservice.org/v2/directions/foot-hiking"


async def fetch_route(
    start_lng: float, start_lat: float,
    end_lng: float, end_lat: float,
) -> dict[str, Any] | None:
    """Call ORS directions and return a dict with 'coordinates' and 'elevation_m'."""
    if not settings.ors_api_key:
        await logger.awarning("ORS API key not set — skipping route fetch")
        return None

    body = {
        "coordinates": [[start_lng, start_lat], [end_lng, end_lat]],
        "elevation": "true",
    }

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            _ORS_DIRECTIONS_URL,
            json=body,
            headers={
                "Authorization": settings.ors_api_key,
                "Content-Type": "application/json",
            },
        )
        if resp.status_code == 429:
            await logger.awarning("ORS rate limit hit")
            return None
        if resp.status_code >= 400:
            await logger.awarning("ORS error", status=resp.status_code, body=resp.text[:300])
            return None

    data = resp.json()

    routes = data.get("routes", [])
    if not routes:
        return None

    route = routes[0]
    summary = route.get("summary", {})

    coords_raw = route.get("geometry", {}).get("coordinates", [])
    coords_latlng: list[list[float]] = []
    elevations: list[float] = []
    for c in coords_raw:
        coords_latlng.append([c[1], c[0]])  # [lat, lng]
        if len(c) > 2:
            elevations.append(c[2])

    ascent = 0.0
    for i in range(1, len(elevations)):
        diff = elevations[i] - elevations[i - 1]
        if diff > 0:
            ascent += diff

    return {
        "coordinates": coords_latlng,
        "elevation_m": round(ascent),
        "distance_km": round(summary.get("distance", 0) / 1000, 1),
        "duration_h": round(summary.get("duration", 0) / 3600, 1),
    }


async def fetch_route_for_trail(lat: float, lng: float, length_km: float) -> dict[str, Any] | None:
    """Generate a plausible out-and-back route from a trail centroid.

    When we only have the center of the trail (from OSM), we create a short
    route going ~half the trail length north, then back. ORS gives us
    real geometry following actual paths.
    """
    offset = (length_km / 2) * 0.009  # ~0.009 deg ≈ 1 km latitude
    if offset < 0.005:
        offset = 0.01
    if offset > 0.15:
        offset = 0.15

    return await fetch_route(lng, lat, lng + offset * 0.3, lat + offset)


async def update_trail_route(pool, trail_id: str, route_data: dict[str, Any]) -> None:
    """Persist route geometry + computed elevation into cached_trails."""
    await pool.execute(
        """UPDATE cached_trails
           SET route = $2,
               elevation_m = CASE WHEN $3 > 0 THEN $3 ELSE elevation_m END,
               duration_h = CASE WHEN $4 > 0 THEN $4 ELSE duration_h END
           WHERE id = $1""",
        trail_id,
        json.dumps(route_data["coordinates"]),
        float(route_data["elevation_m"]),
        float(route_data["duration_h"]),
    )
