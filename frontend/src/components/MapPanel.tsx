import { useCallback, useEffect, useState } from "react";
import { MapContainer, TileLayer, Popup, CircleMarker, Polyline, Marker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { getTrailById, type Trail, type WaypointKind } from "@/lib/trails";
import { useTrails } from "@/hooks/use-trails";
import { CloudRain, Loader2 } from "lucide-react";

import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const ICONIC = [
  { name: "Santorini", lat: 36.3932, lng: 25.4615 },
  { name: "Mykonos", lat: 37.4467, lng: 25.3289 },
  { name: "Meteora", lat: 39.7217, lng: 21.6306 },
  { name: "Samaria", lat: 35.2989, lng: 23.9658 },
];

const WAYPOINT_STYLE: Record<WaypointKind, { emoji: string; bg: string; label: string }> = {
  shelter: { emoji: "🏠", bg: "#0284c7", label: "Shelter" },
  spring: { emoji: "💧", bg: "#38bdf8", label: "Spring" },
};

const GREECE_BOUNDS = { latMin: 34.5, latMax: 40.0, lngMin: 19.3, lngMax: 27.0 };

function isInGreece(lat: number, lng: number): boolean {
  if(lat >= 40.0 && lng >= 21.0 && lat <= 41.5 && lng <= 27.0) {
    return true;
  }
  return (
    lat >= GREECE_BOUNDS.latMin &&
    lat <= GREECE_BOUNDS.latMax &&
    lng >= GREECE_BOUNDS.lngMin &&
    lng <= GREECE_BOUNDS.lngMax
  );
}

function waypointDivIcon(kind: WaypointKind) {
  const s = WAYPOINT_STYLE[kind];
  return L.divIcon({
    className: "pf-custom-pin",
    html: `
      <div style="position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; width: 32px; height: 32px;">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" style="filter: drop-shadow(0px 3px 5px rgba(0,0,0,0.45));">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="${s.bg}" stroke="#ffffff" stroke-width="1.5"/>
        </svg>
        <div style="position: absolute; top: 5px; font-size: 11px;">${s.emoji}</div>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
  });
}

function MapZoomListener({ onZoomChange }: { onZoomChange: (zoom: number) => void }) {
  useMapEvents({
    zoomend: (e) => {
      const map = e.target;
      onZoomChange(map.getZoom());
    },
  });
  return null;
}

function trailPinIcon(highlighted: boolean) {
  const color = highlighted ? "#0284c7" : "#f59e0b";
  const size = highlighted ? 36 : 28;
  return L.divIcon({
    className: "pf-trail-pin",
    html: `
      <div style="position: relative; display: flex; flex-direction: column; align-items: center; width: ${size}px; height: ${size}px;">
        <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" style="filter: drop-shadow(0px 2px 4px rgba(0,0,0,0.5));">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="${color}" stroke="#ffffff" stroke-width="1.5"/>
          <circle cx="12" cy="9" r="3" fill="#ffffff" opacity="0.9"/>
        </svg>
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size],
  });
}

function overrunDivIcon(_name: string) {
  return L.divIcon({
    className: "pf-overrun-pin",
    html: `
      <div style="position: relative; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;">
        <div style="
          position: absolute; width: 100%; height: 100%; border-radius: 50%;
          background: #ef4444; opacity: 0.4; transform: scale(1);
          animation: pinPulse 2s infinite ease-out;
        "></div>
        <div style="
          width: 12px; height: 12px; border-radius: 50%;
          background: #ef4444; border: 2px solid #ffffff;
          box-shadow: 0 0 10px rgba(239, 68, 68, 0.8); z-index: 10;
        "></div>
      </div>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

// ⚡️ NEW: Captures the exact screen box coordinates so the backend only searches what you can see!
function MapBoundsListener({ onBoundsChange }: { onBoundsChange: (bounds: string, zoom: number) => void }) {
  const map = useMapEvents({
    moveend: (e) => updateBounds(e.target),
    zoomend: (e) => updateBounds(e.target),
  });

  const updateBounds = useCallback((m: L.Map) => {
    const b = m.getBounds();
    // Format: south,west,north,east (Required by OSM Overpass API)
    onBoundsChange(`${b.getSouth()},${b.getWest()},${b.getNorth()},${b.getEast()}`, m.getZoom());
  }, [onBoundsChange]);

  useEffect(() => {
    updateBounds(map);
  }, [map, updateBounds]);

  return null;
}

type Focused = { id: string; nonce: number } | null;

export function MapPanel({
  highlightedIds = [] as string[],
  focused = null,
  rerouting = false,
  onRerouteForRain,
}: {
  highlightedIds?: string[];
  focused?: Focused;
  rerouting?: boolean;
  onRerouteForRain?: (trail: any) => void;
}) {
  const { trails: allTrails, source, loading: trailsLoading } = useTrails();
  const [mounted, setMounted] = useState(false);
  const [liveData, setLiveData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  
  // 🗺️ Tracking exact screen borders
  const [currentZoom, setCurrentZoom] = useState(6);
  const [bbox, setBbox] = useState<string>("34.8,19.3,41.8,26.5"); // Default Greece

  useEffect(() => {
    setMounted(true);
    if (!document.getElementById("map-pin-keyframes")) {
      const style = document.createElement("style");
      style.id = "map-pin-keyframes";
      style.innerHTML = `
        @keyframes pinPulse {
          0% { transform: scale(1); opacity: 0.6; }
          100% { transform: scale(2.5); opacity: 0; }
        }
      `;
      document.head.appendChild(style);
    }
  }, []);

  const trailList = Array.isArray(allTrails) ? allTrails : [];
  const focusedTrail = focused ? trailList.find((t) => t.id === focused.id) ?? getTrailById(focused.id) : null;

  useEffect(() => {
    if (!focusedTrail) {
      setLiveData(null);
      return;
    }

    async function fetchRealTelemetry() {
      setLoading(true);
      try {
        const res = await fetch(`/api/trails/${encodeURIComponent(focusedTrail!.name)}/telemetry`);
        if (res.ok) {
          const data = await res.json();
          setLiveData(data);
        }
      } catch (err) {
        console.error("Error connecting to trail telemetry endpoint:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchRealTelemetry();
  }, [focused, focusedTrail]);

  if (!mounted) {
    return <div className="h-full w-full animate-pulse bg-[var(--gradient-horizon)]" />;
  }

  return (
    <div className="relative h-full w-full">
      <MapContainer
        center={[38.5, 23.5]}
        zoom={6}
        scrollWheelZoom
        className="h-full w-full"
        maxBounds={[[34.5, 19.0], [42.5, 30.5]]}
        maxBoundsViscosity={1}
      >
        <TileLayer
          attribution='Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        />
        <TileLayer
          attribution='&copy; Esri Reference Labels'
          url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
        />

        <MapZoomListener onZoomChange={(zoom) => setCurrentZoom(zoom)} />

        {ICONIC.map((p) => (
          <Marker key={p.name} position={[p.lat, p.lng]} icon={overrunDivIcon(p.name)}>
            <Popup>
              <div className="font-sans text-xs">
                <strong className="text-red-500 font-bold">{p.name}</strong><br />
                <span className="text-gray-600">Critical seasonal crowding threshold overrun.</span>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Polylines from cached trail routes */}
        {trailList.filter((t) => highlightedIds.includes(t.id) && t.route?.length > 0).map((t) => {
          const isFocused = focused?.id === t.id;
          const color = isFocused && rerouting
            ? "#38bdf8"
            : isFocused
              ? "#0284c7"
              : "#556B2F";
          return (
            <Polyline
              key={`route-${t.id}-${rerouting && isFocused ? "rain" : "dry"}`}
              positions={t.route}
              pathOptions={{
                color,
                weight: isFocused ? 5 : 3.5,
                opacity: isFocused ? 0.95 : 0.7,
                dashArray: rerouting && isFocused ? "8 6" : undefined,
                lineCap: "round",
                lineJoin: "round",
              }}
            />
          );
        })}

        {/* Nature waypoints (shelters & springs only) */}
        {focusedTrail?.waypoints
          ?.filter((w: any) => w.kind !== "biodiversity")
          .map((w: any, i: number) => {
            const lat = w.lat ?? (focusedTrail.lat + (w.dLat ?? 0));
            const lng = w.lng ?? (focusedTrail.lng + (w.dLng ?? 0));
            if (!isInGreece(lat, lng)) return null;
            return (
              <Marker
                key={`wp-${focusedTrail.id}-${i}`}
                position={[lat, lng]}
                icon={waypointDivIcon(w.kind)}
              >
                <Popup>
                  <div style={{ fontFamily: "Inter, sans-serif", minWidth: 160 }}>
                    <div style={{ fontSize: 11, color: WAYPOINT_STYLE[w.kind as WaypointKind]?.bg ?? "#0284c7", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
                      {WAYPOINT_STYLE[w.kind as WaypointKind]?.label ?? "Feature"}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>
                      {w.name}
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}

        {/* Live telemetry overlay — from /api/trails/:name/telemetry */}
        {liveData && (
          <>
            {liveData.geometry?.length > 0 && (
              <Polyline
                positions={liveData.geometry}
                pathOptions={{
                  color: rerouting ? "#38bdf8" : "#0284c7",
                  weight: 5,
                  opacity: 0.95,
                  lineCap: "round",
                  lineJoin: "round",
                }}
              />
            )}
            {liveData.waypoints
              ?.filter((w: any) => w.kind !== "biodiversity" && isInGreece(w.lat, w.lng))
              .map((w: any, i: number) => (
                <Marker key={`live-wp-${i}`} position={[w.lat, w.lng]} icon={waypointDivIcon(w.kind)}>
                  <Popup>
                    <div style={{ fontFamily: "Inter, sans-serif" }}>
                      <div style={{ fontSize: 11, color: WAYPOINT_STYLE[w.kind as WaypointKind]?.bg ?? "#0284c7", fontWeight: 600, textTransform: "uppercase" }}>
                        {WAYPOINT_STYLE[w.kind as WaypointKind]?.label ?? "Feature"}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b", marginTop: 2 }}>
                        {w.name}
                      </div>
                    </div>
                  </Popup>
                </Marker>
              ))}

            <CircleMarker
              center={[liveData.lat, liveData.lng]}
              radius={14}
              pathOptions={{ color: "#0284c7", fillColor: "#0284c7", fillOpacity: 0.9 }}
            >
              <Popup>
                <div style={{ minWidth: 220, fontFamily: "Inter, sans-serif" }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "#0f172a" }}>{focusedTrail?.name}</div>
                  <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6 }}>{focusedTrail?.region}</div>
                  <hr style={{ margin: "6px 0", borderColor: "#cbd5e1" }} />
                  <div style={{ fontSize: 12, color: "#0284c7" }}>
                    <strong>Weather:</strong> {liveData.weather?.temp}°C, {liveData.weather?.condition}
                  </div>
                  <div style={{ fontSize: 12, color: "#16a34a", marginTop: 2 }}>
                    <strong>Route Profiles:</strong> {liveData.routing?.distance_km} km | +{liveData.routing?.ascent_m}m Ascent
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          </>
        )}

        {/* Trail pins */}
        {trailList
          .filter((t) => isInGreece(t.lat, t.lng))
          .map((t) => {
            const isHighlighted = highlightedIds.includes(t.id);
            return (
              <Marker
                key={t.id}
                position={[t.lat, t.lng]}
                icon={trailPinIcon(isHighlighted)}
              >
                <Popup>
                  <TrailPopup trail={t} />
                </Popup>
              </Marker>
            );
          })}

        <FlyToTrail focused={focused} liveData={liveData} databaseTrails={trailList} />
      </MapContainer>

      <Legend trailCount={trailList.length} source={source} loading={trailsLoading || loading} />

      {loading && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[400] flex items-center gap-2 rounded-full bg-background/95 px-4 py-1.5 text-xs font-semibold shadow-xl border animate-fade-in backdrop-blur-md">
          <Loader2 className="size-3.5 animate-spin text-primary" />
          <span>Syncing topography view...</span>
        </div>
      )}
    </div>
  );
}

function TrailPopup({ trail }: { trail: any }) {
  return (
    <div style={{ minWidth: 200, fontFamily: "Inter, sans-serif" }}>
      <div style={{ fontWeight: 600, fontSize: 14, color: "#1e293b" }}>{trail.name}</div>
      <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6 }}>{trail.region}</div>
      <div style={{ fontSize: 12, marginBottom: 6, color: "#334155" }}>{trail.blurb}</div>
      <div style={{ fontSize: 11, color: "#16a34a", fontWeight: 600 }}>
        {trail.difficulty} · {trail.lengthKm} km · {trail.elevationM} m gain
      </div>
    </div>
  );
}

function FlyToTrail({ focused, liveData, databaseTrails }: { focused: Focused; liveData: any; databaseTrails: any[] }) {
  const map = useMap();
  useEffect(() => {
    if (liveData) {
      map.flyTo([liveData.lat, liveData.lng], 13, { duration: 1.5 });
    } else if (focused) {
      const trail = databaseTrails.find((t: any) => t.id === focused.id);
      if (trail) map.flyTo([trail.lat, trail.lng], 11, { duration: 1.4 });
    }
  }, [focused, liveData, databaseTrails, map]);
  return null;
}

function Legend({ trailCount, source, loading }: { trailCount: number; source: "mock" | "live"; loading: boolean }) {
  return (
    <div className="absolute bottom-4 left-4 z-[400] rounded-xl border border-white/10 bg-black/70 p-3 text-xs text-white shadow-2xl backdrop-blur-md">
      <div className="mb-2 font-semibold tracking-wide text-gray-200">Topographic Sat-Overlay</div>
      <div className="flex items-center gap-2">
        <svg width="12" height="14" viewBox="0 0 24 28" className="shrink-0">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="#f59e0b" stroke="#fff" strokeWidth="2"/>
        </svg>
        <span className="text-gray-300">
          {loading ? "Loading trails…" : `${trailCount} trails`}
          {source === "live" && !loading && (
            <span className="ml-1 text-[10px] text-amber-400">OSM</span>
          )}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <svg width="12" height="14" viewBox="0 0 24 28" className="shrink-0">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="#0284c7" stroke="#fff" strokeWidth="2"/>
        </svg>
        <span className="text-gray-300">Selected Trail</span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className="relative flex size-2.5 items-center justify-center">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75"></span>
          <span className="relative inline-flex size-2 rounded-full bg-red-500"></span>
        </span>
        <span className="text-gray-300 ml-1">Overtouristed Density Peak Warning</span>
      </div>
    </div>
  );
}
