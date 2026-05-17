-- Migration 004: cached trail data from external APIs (OSM, ORS, OpenWeatherMap).

CREATE TABLE IF NOT EXISTS cached_trails (
    id text NOT NULL PRIMARY KEY,
    osm_id bigint,
    name text NOT NULL,
    region text NOT NULL DEFAULT '',
    lat double precision NOT NULL,
    lng double precision NOT NULL,
    difficulty text NOT NULL DEFAULT 'Moderate',
    length_km double precision NOT NULL DEFAULT 0,
    elevation_m double precision NOT NULL DEFAULT 0,
    duration_h double precision NOT NULL DEFAULT 0,
    blurb text NOT NULL DEFAULT '',
    tags jsonb NOT NULL DEFAULT '[]',
    route jsonb,                       -- [[lat,lng], ...] from ORS
    waypoints jsonb NOT NULL DEFAULT '[]',
    fetched_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_cached_trails_osm_id ON cached_trails (osm_id);

CREATE TABLE IF NOT EXISTS cached_weather (
    trail_id text NOT NULL REFERENCES cached_trails(id) ON DELETE CASCADE,
    weather_json jsonb NOT NULL,
    fetched_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (trail_id)
);
