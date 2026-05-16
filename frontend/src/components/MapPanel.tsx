// frontend/src/components/MapPanel.tsx
import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Popup, CircleMarker, Polyline, Marker, useMap, useMapEvents } from "react-leaflet";
import { useQuery } from "@tanstack/react-query";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
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

export type WaypointKind = "shelter" | "spring" | "biodiversity";

const WAYPOINT_STYLE: Record<WaypointKind, { emoji: string; bg: string; label: string }> = {
  shelter: { emoji: "🏠", bg: "#0284c7", label: "Shelter" },
  spring: { emoji: "💧", bg: "#38bdf8", label: "Spring" },
  biodiversity: { emoji: "🌿", bg: "#22c55e", label: "Biodiversity" },
};

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

function overrunDivIcon(name: string) {
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
  const [mounted, setMounted] = useState(false);
  const [liveData, setLiveData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [currentZoom, setCurrentZoom] = useState(6);

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
  const popularOnlyFlag = currentZoom < 9;

  const { data: databaseTrails = [] } = useQuery<any[]>({
    queryKey: ["trails", popularOnlyFlag],
    queryFn: () => fetch(`/api/trails?popular_only=${popularOnlyFlag}`).then((res) => res.json()),
  });

  // Guard to ensure array type parameters are valid
  const trailList = Array.isArray(databaseTrails) ? databaseTrails : [];
  const focusedTrail = focused ? trailList.find((t) => t.id === focused.id) : null;

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
      {/* Layer 1: The Raw Satellite Photos (Base Layer) */}
      <TileLayer
        attribution='Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
      />

      {/* Layer 2: The Transparent Text Overlay (Adds Cities, Borders & Names) */}
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

        {liveData && (
          <>
            {liveData.geometry && (
              <Polyline
                positions={liveData.geometry}
                pathOptions={{
                  color: rerouting ? "#38bdf8" : "#0284c7",
                  weight: 5,
                  opacity: 0.95,
                  lineCap: "round",
                  lineJoin: "round"
                }}
              />
            )}
            {liveData.waypoints?.map((w: any, i: number) => (
              <Marker key={`live-wp-${i}`} position={[w.lat, w.lng]} icon={waypointDivIcon(w.kind)}>
                <Popup>
                  <div style={{ fontFamily: "Inter, sans-serif" }}>
                    <div style={{ fontSize: 10, color: "#22c55e", fontWeight: 700, textTransform: "uppercase" }}>
                      🌿 Live Feature Discoveries
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

        {/* 🔧 FIXED: Added explicit Array.isArray check to clear out the minified type errors completely */}
        {trailList.map((t) => {
          const isHighlighted = highlightedIds.includes(t.id);
          return (
            <CircleMarker
              key={t.id}
              center={[t.lat, t.lng]}
              radius={isHighlighted ? 14 : 8}
              pathOptions={{
                color: isHighlighted ? "var(--aegean)" : "var(--olive)",
                fillColor: isHighlighted ? "var(--aegean)" : "var(--olive)",
                fillOpacity: isHighlighted ? 0.9 : 0.7,
                weight: isHighlighted ? 3 : 1.5,
              }}
            >
              <Popup>
                <TrailPopup trail={t} />
              </Popup>
            </CircleMarker>
          );
        })}

        <FlyToTrail focused={focused} liveData={liveData} databaseTrails={trailList} />
      </MapContainer>

      <Legend />

      {loading && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[400] flex items-center gap-2 rounded-full bg-background/95 px-4 py-1.5 text-xs font-semibold shadow-xl border animate-fade-in backdrop-blur-md">
          <Loader2 className="size-3.5 animate-spin text-primary" />
          <span>Syncing topographic coordinates...</span>
        </div>
      )}

      {focusedTrail && onRerouteForRain && (
        <button
          onClick={() => onRerouteForRain(focusedTrail)}
          disabled={rerouting}
          className="absolute right-4 top-4 z-[400] flex items-center gap-2 rounded-full border border-border bg-card/95 px-4 py-2 text-xs font-semibold text-foreground shadow-[var(--shadow-elevated)] backdrop-blur transition hover:border-primary/40 hover:text-primary disabled:opacity-70"
        >
          {rerouting ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              Re-routing for rain…
            </>
          ) : (
            <>
              <CloudRain className="size-3.5 text-[#0EA5E9]" />
              Re-route for Rain
            </>
          )}
        </button>
      )}
    </div>
  );
}

function TrailPopup({ trail }: { trail: any }) {
  return (
    <div style={{ minWidth: 200, fontFamily: "Inter, sans-serif" }}>
      <div style={{ fontWeight: 600, fontSize: 14, color: "oklch(0.32 0.13 250)" }}>
        {trail.name}
      </div>
      <div style={{ fontSize: 11, color: "oklch(0.45 0.03 250)", marginBottom: 6 }}>
        {trail.region}
      </div>
      <div style={{ fontSize: 12, marginBottom: 6 }}>{trail.blurb}</div>
      <div style={{ fontSize: 11, color: "oklch(0.5 0.08 120)" }}>
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
      const trail = databaseTrails.find((t) => t.id === focused.id);
      if (trail) map.flyTo([trail.lat, trail.lng], 11, { duration: 1.4 });
    }
  }, [focused, liveData, databaseTrails, map]);
  return null;
}

function Legend() {
  return (
    <div className="absolute bottom-4 left-4 z-[400] rounded-xl border border-white/10 bg-black/70 p-3 text-xs text-white shadow-2xl backdrop-blur-md">
      <div className="mb-2 font-semibold tracking-wide text-gray-200">Topographic Sat-Overlay</div>
      <div className="flex items-center gap-2">
        <span className="inline-block size-3 rounded-full border border-white bg-[#22c55e]" />
        <span className="text-gray-300">Verified Hidden Gem</span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className="inline-block size-3 rounded-full border border-white bg-[#0284c7]" />
        <span className="text-gray-300">Suggested Active Route Target</span>
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