"""Fetch hiking trails in Greece from OpenStreetMap via the Overpass API.

Includes a curated seed dataset of popular Greek trails so the app works
even when the Overpass API is unreachable (rate-limited, 406, timeout).
"""

from __future__ import annotations

import hashlib
import json
import math
from datetime import datetime, timezone
from typing import Any

import httpx

from app.config import settings
from app.logging import get_logger

logger = get_logger("services.osm")

_GREECE_BBOX = "(34.5,19.3,42.0,30.0)"

_OVERPASS_QUERY = (
    "[out:json][timeout:60];"
    "("
    f'relation["route"="hiking"]["name"]{_GREECE_BBOX};'
    f'relation["route"="foot"]["name"]{_GREECE_BBOX};'
    f'way["highway"="path"]["name"]["sac_scale"]{_GREECE_BBOX};'
    f'way["highway"="track"]["name"]["sac_scale"]{_GREECE_BBOX};'
    ");"
    "out center tags;"
)

_OVERPASS_ENDPOINTS = [
    settings.overpass_url,
    "https://overpass.kumi.systems/api/interpreter",
]

_DIFFICULTY_MAP = {
    "hiking": "Easy",
    "mountain_hiking": "Moderate",
    "demanding_mountain_hiking": "Strenuous",
    "alpine_hiking": "Strenuous",
    "demanding_alpine_hiking": "Strenuous",
    "difficult_alpine_hiking": "Strenuous",
}

_SPEED_KMH = 4.0
_ELEVATION_PENALTY_H_PER_M = 1.0 / 600

# ── Curated seed trails ─────────────────────────────────────────────────
# Used when Overpass is unreachable. These are real Greek hiking trails
# with approximate coordinates and metadata.

SEED_TRAILS: list[dict[str, Any]] = [
    {"id": "seed-vikos", "osm_id": 0, "name": "Vikos Gorge Trail", "region": "Epirus", "lat": 39.9869, "lng": 20.7406, "difficulty": "Moderate", "length_km": 12.4, "elevation_m": 620, "duration_h": 5, "blurb": "Rim walk over the deepest gorge in the world, stone villages, monasteries and complete silence.", "tags": ["seed"]},
    {"id": "seed-menalon", "osm_id": 0, "name": "Menalon Trail — Lousios Gorge", "region": "Peloponnese", "lat": 37.6244, "lng": 22.0289, "difficulty": "Moderate", "length_km": 14.8, "elevation_m": 780, "duration_h": 6, "blurb": "Greece's first Leading Quality Trail — river canyon, cliff-hanging monasteries, watermills.", "tags": ["seed"]},
    {"id": "seed-aradena", "osm_id": 0, "name": "Aradena Gorge", "region": "Crete", "lat": 35.2253, "lng": 24.0681, "difficulty": "Strenuous", "length_km": 7.6, "elevation_m": 650, "duration_h": 4, "blurb": "Iron-staircase descent into a wild Cretan gorge — the quiet alternative to Samaria.", "tags": ["seed"]},
    {"id": "seed-enipeas", "osm_id": 0, "name": "Enipeas Canyon to Prionia", "region": "Macedonia", "lat": 40.0859, "lng": 22.3586, "difficulty": "Strenuous", "length_km": 10.2, "elevation_m": 950, "duration_h": 7, "blurb": "Waterfalls and beech forest on the slopes of Mt Olympus.", "tags": ["seed"]},
    {"id": "seed-tilos", "osm_id": 0, "name": "Tilos Eristos Loop", "region": "Dodecanese", "lat": 36.4533, "lng": 27.3681, "difficulty": "Easy", "length_km": 8.1, "elevation_m": 240, "duration_h": 3, "blurb": "Greece's first carbon-neutral island — wildflower terraces and empty Aegean coves.", "tags": ["seed"]},
    {"id": "seed-pelion", "osm_id": 0, "name": "Centaur Path · Tsagarada to Mylopotamos", "region": "Thessaly", "lat": 39.3961, "lng": 23.2342, "difficulty": "Moderate", "length_km": 9.3, "elevation_m": 510, "duration_h": 4, "blurb": "Cobbled kalderimi from chestnut forest down to a secret beach.", "tags": ["seed"]},
    {"id": "seed-elati", "osm_id": 0, "name": "Elati Plateau Loop", "region": "Thessaly", "lat": 39.5586, "lng": 21.4731, "difficulty": "Easy", "length_km": 6.4, "elevation_m": 180, "duration_h": 2, "blurb": "Family-friendly pine forest plateau, mushroom-rich in autumn.", "tags": ["seed"]},
    {"id": "seed-samaria", "osm_id": 0, "name": "Samaria Gorge", "region": "Crete", "lat": 35.2990, "lng": 23.9660, "difficulty": "Moderate", "length_km": 16.0, "elevation_m": 1250, "duration_h": 6, "blurb": "The most famous Cretan gorge — 16 km from the White Mountains to the sea.", "tags": ["seed"]},
    {"id": "seed-e4-pindus", "osm_id": 0, "name": "E4 Trail — Pindus Section", "region": "Epirus", "lat": 39.7000, "lng": 21.1000, "difficulty": "Strenuous", "length_km": 25.0, "elevation_m": 1400, "duration_h": 10, "blurb": "Multi-day section of the European long-distance path through the Pindus Mountains.", "tags": ["seed"]},
    {"id": "seed-neda", "osm_id": 0, "name": "Neda River Waterfalls Trail", "region": "Peloponnese", "lat": 37.3800, "lng": 21.9000, "difficulty": "Moderate", "length_km": 8.0, "elevation_m": 350, "duration_h": 4, "blurb": "Swim under waterfalls on the only river in Greece named after a goddess.", "tags": ["seed"]},
    {"id": "seed-meteora", "osm_id": 0, "name": "Meteora Monasteries Trail", "region": "Thessaly", "lat": 39.7217, "lng": 21.6306, "difficulty": "Moderate", "length_km": 11.0, "elevation_m": 400, "duration_h": 5, "blurb": "Walk between suspended monasteries on sandstone pillars.", "tags": ["seed"]},
    {"id": "seed-imbros", "osm_id": 0, "name": "Imbros Gorge", "region": "Crete", "lat": 35.2760, "lng": 24.1580, "difficulty": "Easy", "length_km": 7.5, "elevation_m": 600, "duration_h": 3, "blurb": "The gentler sister of Samaria — narrower walls, fewer crowds.", "tags": ["seed"]},
    {"id": "seed-andros", "osm_id": 0, "name": "Andros Route — Menites to Apikia", "region": "Cyclades", "lat": 37.8400, "lng": 24.9100, "difficulty": "Easy", "length_km": 5.0, "elevation_m": 200, "duration_h": 2, "blurb": "Lush green springs and ancient stone paths on the island of Andros.", "tags": ["seed"]},
    {"id": "seed-taygetos", "osm_id": 0, "name": "Taygetos Gorge — Ridomo", "region": "Peloponnese", "lat": 36.9700, "lng": 22.3400, "difficulty": "Strenuous", "length_km": 9.0, "elevation_m": 800, "duration_h": 5, "blurb": "Deep canyon in the Mani — wild landscape, Byzantine towers.", "tags": ["seed"]},
    {"id": "seed-nestos", "osm_id": 0, "name": "Nestos River Path", "region": "Thrace", "lat": 41.1300, "lng": 24.6900, "difficulty": "Easy", "length_km": 10.0, "elevation_m": 100, "duration_h": 3, "blurb": "Riverside trail through dense forest along the Nestos in northeastern Greece.", "tags": ["seed"]},
    {"id": "seed-zagori", "osm_id": 0, "name": "Zagori Papigo Pools Trail", "region": "Epirus", "lat": 39.9500, "lng": 20.6900, "difficulty": "Easy", "length_km": 4.0, "elevation_m": 150, "duration_h": 2, "blurb": "Stone-paved path to turquoise natural rock pools at the base of Astraka.", "tags": ["seed"]},
    {"id": "seed-kalymnos", "osm_id": 0, "name": "Kalymnos Italian Path", "region": "Dodecanese", "lat": 36.9700, "lng": 26.9800, "difficulty": "Moderate", "length_km": 6.5, "elevation_m": 350, "duration_h": 3, "blurb": "Italian-era cobbled road across the climbing island, sea views throughout.", "tags": ["seed"]},
    {"id": "seed-olympus-mytikas", "osm_id": 0, "name": "Mt Olympus — Mytikas Summit", "region": "Macedonia", "lat": 40.0850, "lng": 22.3500, "difficulty": "Strenuous", "length_km": 12.0, "elevation_m": 1800, "duration_h": 9, "blurb": "Classic ascent to the throne of Zeus — Greece's highest peak at 2,917 m.", "tags": ["seed"]},
    {"id": "seed-sounion", "osm_id": 0, "name": "Cape Sounion Coastal Path", "region": "Attica", "lat": 37.6500, "lng": 24.0250, "difficulty": "Easy", "length_km": 7.0, "elevation_m": 120, "duration_h": 2, "blurb": "Clifftop walk ending at the Temple of Poseidon — sunset views over the Aegean.", "tags": ["seed"]},
    {"id": "seed-knossos", "osm_id": 0, "name": "Archanes — Juktas Peak", "region": "Crete", "lat": 35.2400, "lng": 25.1600, "difficulty": "Moderate", "length_km": 8.0, "elevation_m": 500, "duration_h": 4, "blurb": "Climb the sacred mountain above Knossos with views over Heraklion and the sea.", "tags": ["seed"]},
]


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(d_lon / 2) ** 2
    )
    return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _stable_id(osm_type: str, osm_id: int) -> str:
    raw = f"{osm_type}/{osm_id}"
    return hashlib.sha256(raw.encode()).hexdigest()[:12]


_GREEK_REGION_HINTS: list[tuple[tuple[float, float, float, float], str]] = [
    ((34.8, 23.4, 35.6, 26.4), "Crete"),
    ((39.5, 19.3, 39.9, 20.3), "Corfu, Ionian Islands"),
    ((37.5, 20.3, 38.9, 21.0), "Ionian Islands"),
    ((36.3, 25.0, 37.1, 26.0), "Cyclades"),
    ((36.0, 27.0, 37.0, 28.5), "Dodecanese"),
    ((38.5, 25.5, 39.5, 26.8), "Lesbos, North Aegean"),
    ((39.6, 20.5, 40.0, 21.5), "Epirus"),
    ((37.0, 21.5, 38.5, 23.0), "Peloponnese"),
    ((38.5, 21.5, 39.5, 23.0), "Central Greece"),
    ((39.0, 21.5, 40.5, 23.0), "Thessaly"),
    ((40.0, 21.5, 41.5, 24.5), "Macedonia"),
    ((40.5, 24.0, 41.8, 26.5), "Thrace"),
    ((37.8, 23.5, 38.2, 24.0), "Attica"),
]


def _guess_region(lat: float, lng: float, tags: dict[str, str]) -> str:
    for key in ("is_in", "is_in:region", "addr:state", "place"):
        val = tags.get(key)
        if val:
            return val
    for (min_lat, min_lng, max_lat, max_lng), name in _GREEK_REGION_HINTS:
        if min_lat <= lat <= max_lat and min_lng <= lng <= max_lng:
            return name
    return "Greece"


def _parse_element(el: dict[str, Any]) -> dict[str, Any] | None:
    tags = el.get("tags", {})
    name = tags.get("name:en") or tags.get("name")
    if not name:
        return None

    center = el.get("center", {})
    lat = center.get("lat") or el.get("lat")
    lng = center.get("lon") or el.get("lon")
    if lat is None or lng is None:
        return None

    lat_f, lng_f = float(lat), float(lng)
    if not (34.5 <= lat_f <= 42.0 and 19.3 <= lng_f <= 30.0):
        return None

    osm_type = el.get("type", "way")
    osm_id = el.get("id", 0)

    sac = tags.get("sac_scale", "")
    difficulty = _DIFFICULTY_MAP.get(sac, "Moderate")

    length_km = 0.0
    for key in ("distance", "length"):
        dist_tag = tags.get(key)
        if dist_tag:
            try:
                length_km = float(dist_tag.replace("km", "").replace(",", ".").strip())
                break
            except ValueError:
                pass

    elevation_m = 0.0
    for key in ("ascent", "ele", "elevation"):
        val = tags.get(key)
        if val:
            try:
                elevation_m = float(val.replace("m", "").replace(",", ".").strip())
                break
            except ValueError:
                pass

    duration_h = 0.0
    if length_km > 0:
        duration_h = round(length_km / _SPEED_KMH + elevation_m * _ELEVATION_PENALTY_H_PER_M, 1)
    elif elevation_m > 0:
        duration_h = round(elevation_m * _ELEVATION_PENALTY_H_PER_M + 1, 1)

    blurb = tags.get("description:en") or tags.get("description") or ""
    if not blurb:
        parts: list[str] = []
        if tags.get("surface"):
            parts.append(f"Surface: {tags['surface']}")
        if tags.get("trail_visibility"):
            parts.append(f"Visibility: {tags['trail_visibility']}")
        blurb = ". ".join(parts)

    return {
        "id": _stable_id(osm_type, osm_id),
        "osm_id": osm_id,
        "name": name,
        "region": _guess_region(float(lat), float(lng), tags),
        "lat": float(lat),
        "lng": float(lng),
        "difficulty": difficulty,
        "length_km": length_km,
        "elevation_m": elevation_m,
        "duration_h": duration_h,
        "blurb": blurb,
        "tags": list(tags.keys()),
    }


async def fetch_trails_from_osm() -> list[dict[str, Any]]:
    """Query the Overpass API (trying multiple endpoints) and return parsed trail dicts.

    Falls back to the curated seed dataset if all Overpass endpoints fail.
    """
    last_error: Exception | None = None

    for endpoint in _OVERPASS_ENDPOINTS:
        try:
            async with httpx.AsyncClient(timeout=90) as client:
                resp = await client.post(
                    endpoint,
                    data={"data": _OVERPASS_QUERY},
                    headers={
                        "User-Agent": "LocalHost-TrailApp/1.0",
                        "Accept": "application/json",
                    },
                )
                if resp.status_code in (406, 429, 504):
                    await logger.awarning(
                        "Overpass endpoint rejected request",
                        endpoint=endpoint,
                        status=resp.status_code,
                    )
                    continue
                resp.raise_for_status()

            data = resp.json()
            elements = data.get("elements", [])
            await logger.ainfo("Overpass returned elements", endpoint=endpoint, count=len(elements))

            trails: list[dict[str, Any]] = []
            seen_ids: set[str] = set()
            for el in elements:
                parsed = _parse_element(el)
                if parsed and parsed["id"] not in seen_ids:
                    seen_ids.add(parsed["id"])
                    trails.append(parsed)

            if trails:
                await logger.ainfo("Parsed unique named trails from OSM", count=len(trails))
                return trails

        except Exception as exc:
            last_error = exc
            await logger.awarning("Overpass endpoint failed", endpoint=endpoint, error=str(exc))

    # All endpoints failed — use the curated seed dataset
    await logger.awarning(
        "All Overpass endpoints failed — using seed trail dataset",
        last_error=str(last_error) if last_error else "none",
    )
    return list(SEED_TRAILS)


async def upsert_cached_trails(pool, trails: list[dict[str, Any]]) -> None:
    """Insert or update trail rows in cached_trails."""
    now = datetime.now(timezone.utc)
    for t in trails:
        await pool.execute(
            """INSERT INTO cached_trails
                 (id, osm_id, name, region, lat, lng, difficulty,
                  length_km, elevation_m, duration_h, blurb, tags, fetched_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
               ON CONFLICT (id) DO UPDATE SET
                 name=EXCLUDED.name, region=EXCLUDED.region,
                 lat=EXCLUDED.lat, lng=EXCLUDED.lng,
                 difficulty=EXCLUDED.difficulty, length_km=EXCLUDED.length_km,
                 elevation_m=EXCLUDED.elevation_m, duration_h=EXCLUDED.duration_h,
                 blurb=EXCLUDED.blurb, tags=EXCLUDED.tags, fetched_at=EXCLUDED.fetched_at""",
            t["id"], t["osm_id"], t["name"], t["region"],
            t["lat"], t["lng"], t["difficulty"],
            t["length_km"], t["elevation_m"], t["duration_h"],
            t["blurb"], json.dumps(t["tags"]), now,
        )


async def get_cached_trails(pool) -> list[dict[str, Any]]:
    """Return all cached trails, ordered by name."""
    rows = await pool.fetch("SELECT * FROM cached_trails ORDER BY name")
    return [dict(r) for r in rows]


async def get_cached_trail(pool, trail_id: str) -> dict[str, Any] | None:
    row = await pool.fetchrow("SELECT * FROM cached_trails WHERE id = $1", trail_id)
    return dict(row) if row else None
