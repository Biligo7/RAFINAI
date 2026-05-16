import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Popup, CircleMarker, Polyline, Marker, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { TRAILS, getTrailById, type Trail, type WaypointKind } from "@/lib/trails";
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
  shelter: { emoji: "🏠", bg: "#005BAE", label: "Shelter" },
  spring: { emoji: "💧", bg: "#0EA5E9", label: "Spring" },
  biodiversity: { emoji: "🌿", bg: "#556B2F", label: "Biodiversity" },
};

function waypointDivIcon(kind: WaypointKind) {
  const s = WAYPOINT_STYLE[kind];
  return L.divIcon({
    className: "pf-waypoint",
    html: `<div style="
      width:26px;height:26px;border-radius:50%;
      background:${s.bg};color:white;display:grid;place-items:center;
      font-size:13px;border:2px solid white;
      box-shadow:0 2px 6px rgba(0,0,0,0.25);
    ">${s.emoji}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
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
  onRerouteForRain?: (trail: Trail) => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const focusedTrail = focused ? getTrailById(focused.id) : null;

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
        style={{ background: "oklch(0.92 0.03 220)" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        />

        {ICONIC.map((p) => (
          <CircleMarker
            key={p.name}
            center={[p.lat, p.lng]}
            radius={9}
            pathOptions={{
              color: "oklch(0.55 0.22 25)",
              fillColor: "oklch(0.6 0.22 25)",
              fillOpacity: 0.55,
              weight: 1.5,
            }}
          >
            <Popup>
              <strong>{p.name}</strong>
              <br />
              <span style={{ color: "oklch(0.4 0.05 250)" }}>
                Overtouristed - ask Local Host for an alternative.
              </span>
            </Popup>
          </CircleMarker>
        ))}

        {/* Polylines for any highlighted trail (OpenRouteService geometry) */}
        {TRAILS.filter((t) => highlightedIds.includes(t.id)).map((t) => {
          const isFocused = focused?.id === t.id;
          const color = isFocused && rerouting
            ? "#0EA5E9" // rainy reroute — sky blue
            : isFocused
              ? "#005BAE" // aegean
              : "#556B2F"; // olive
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
              className={rerouting && isFocused ? "pf-route-pulse" : undefined}
            />
          );
        })}

        {/* Nature waypoints — only for the focused trail */}
        {focusedTrail?.waypoints.map((w, i) => (
          <Marker
            key={`wp-${focusedTrail.id}-${i}`}
            position={[focusedTrail.lat + w.dLat, focusedTrail.lng + w.dLng]}
            icon={waypointDivIcon(w.kind)}
          >
            <Popup>
              <div style={{ fontFamily: "Inter, sans-serif", minWidth: 160 }}>
                <div style={{ fontSize: 11, color: WAYPOINT_STYLE[w.kind].bg, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
                  {WAYPOINT_STYLE[w.kind].label}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "oklch(0.32 0.13 250)" }}>
                  {w.name}
                </div>
                <div style={{ fontSize: 11, color: "oklch(0.5 0.03 250)", marginTop: 2 }}>
                  via iNaturalist · community-verified
                </div>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Trail centroids */}
        {TRAILS.map((t) => {
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

        <FlyToTrail focused={focused} />
      </MapContainer>

      <Legend />

      {/* Re-route for Rain — floating action when a trail is focused */}
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

function TrailPopup({ trail }: { trail: Trail }) {
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

function FlyToTrail({ focused }: { focused: Focused }) {
  const map = useMap();
  useEffect(() => {
    if (!focused) return;
    const trail = getTrailById(focused.id);
    if (!trail) return;
    map.flyTo([trail.lat, trail.lng], 11, { duration: 1.4 });
  }, [focused, map]);
  return null;
}

function Legend() {
  return (
    <div className="absolute bottom-4 left-4 z-[400] rounded-xl border border-border bg-card/95 p-3 text-xs shadow-[var(--shadow-soft)] backdrop-blur">
      <div className="mb-2 font-semibold text-foreground">Trail map</div>
      <div className="flex items-center gap-2">
        <span className="inline-block size-3 rounded-full bg-[var(--olive)]" />
        <span className="text-muted-foreground">Hidden-gem trail</span>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <span className="inline-block h-1 w-5 rounded-full bg-[#005BAE]" />
        <span className="text-muted-foreground">Suggested route</span>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <span className="inline-block h-1 w-5 rounded-full bg-[#0EA5E9]" style={{ borderTop: "1px dashed #0EA5E9" }} />
        <span className="text-muted-foreground">Rain-safe re-route</span>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <span
          className="inline-block size-3 rounded-full"
          style={{ background: "oklch(0.6 0.22 25 / 0.6)" }}
        />
        <span className="text-muted-foreground">Overtouristed icon</span>
      </div>
    </div>
  );
}
