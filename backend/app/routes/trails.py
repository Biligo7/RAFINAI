# backend/app/routes/trails.py
from fastapi import APIRouter, HTTPException
from typing import List
from app.models import TrailResponse
from app.services.hikers_data import (
    fetch_location_coordinates,
    fetch_live_weather,
    fetch_ors_routing,
    fetch_inaturalist_biodiversity,
    fetch_osm_features,
    fetch_live_osm_trails_network
)

router = APIRouter(prefix="/api/trails", tags=["trails"])

@router.get("", response_model=List[TrailResponse])
async def list_trails(popular_only: bool = True):
    """Dynamically streams the baseline trail arrays, filtering by popular 
    or detailed views depending on client-side map requests.
    """
    live_network = await fetch_live_osm_trails_network(popular_only=popular_only)
    return live_network


@router.get("/{trail_id}", response_model=TrailResponse)
async def get_trail_by_id(trail_id: str):
    """Finds a specific trail from the live data stream."""
    live_network = await fetch_live_osm_trails_network()
    for trail in live_network:
        if trail["id"] == trail_id:
            return trail
    raise HTTPException(status_code=404, detail="Trail lookup node expired or not found")


@router.get("/{location_name}/telemetry")
async def get_live_trail_telemetry(location_name: str):
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
            "name": species,
            "lat": lat + (idx + 1) * 0.003, 
            "lng": lon - (idx + 1) * 0.003
        })
        
    return {
        "location": location_name,
        "lat": lat,
        "lng": lon,
        "weather": weather,
        "routing": routing,
        "geometry": routing.get("geometry", []), # Added fallback get structure safely
        "waypoints": api_waypoints
    }