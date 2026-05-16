// Mock catalog of hidden-gem Greek trails used by the chat assistant + map.
export type WaypointKind = "shelter" | "spring" | "biodiversity";

export type Waypoint = {
  kind: WaypointKind;
  name: string;
  dLat: number;
  dLng: number;
};

export type Trail = {
  id: string;
  name: string;
  region: string;
  lat: number;
  lng: number;
  difficulty: "Easy" | "Moderate" | "Strenuous";
  lengthKm: number;
  elevationM: number;
  durationH: number;
  vibe: string;
  blurb: string;
  alternativeTo?: string;
  image: string;
  sustainability: number;
  sustainabilityNote: string;
  safety: { status: "safe" | "caution" | "warning"; label: string };
  /** Polyline of [lat, lng] pairs — placeholder for OpenRouteService geometry. */
  route: [number, number][];
  /** Nature waypoints — placeholder for iNaturalist + refuge data. */
  waypoints: Waypoint[];
  /** A lower-altitude trail to suggest when re-routing for rain. */
  rainAlternativeId?: string;
};

export const TRAIL_CARD_MARKER = /\[\[trails:([a-z0-9,\-]+)\]\]/i;

// Build a plausible mock polyline around a trail center.
// Replace with OpenRouteService GET /v2/directions/foot-hiking when wired.
function mockRoute(lat: number, lng: number, seed: number): [number, number][] {
  const pts: [number, number][] = [];
  const span = 0.05;
  for (let i = 0; i < 14; i++) {
    const t = i / 13;
    const wobble = Math.sin((i + seed) * 1.3) * 0.012;
    const drift = Math.cos((i + seed) * 0.7) * 0.009;
    pts.push([
      lat - span / 2 + t * span + wobble,
      lng - span / 2 + t * span + drift,
    ]);
  }
  return pts;
}


type TrailBase = Omit<Trail, "route" | "waypoints" | "rainAlternativeId">;

const TRAILS_BASE: TrailBase[] = [
  {
    id: "vikos-gorge",
    name: "Vikos Gorge Rim",
    region: "Zagori, Epirus",
    lat: 39.9869,
    lng: 20.7406,
    difficulty: "Moderate",
    lengthKm: 12.4,
    elevationM: 620,
    durationH: 5,
    vibe: "Cliff-top monastery views over the world's deepest gorge.",
    blurb:
      "Skip the crowds of Meteora — Vikos rewards you with stone villages, springs and complete silence.",
    alternativeTo: "Meteora",
    image: "https://images.unsplash.com/photo-1508739773434-c26b3d09e071?w=800&q=70&auto=format&fit=crop",
    sustainability: 9.4,
    sustainabilityNote: "High impact for Papingo stone-village guesthouses",
    safety: { status: "safe", label: "Clear skies · trail open" },
  },
  {
    id: "menalon",
    name: "Menalon Trail · Lousios Stage",
    region: "Arcadia, Peloponnese",
    lat: 37.6244,
    lng: 22.0289,
    difficulty: "Moderate",
    lengthKm: 14.8,
    elevationM: 780,
    durationH: 6,
    vibe: "River canyon, cliff-hanging monasteries, watermills.",
    blurb:
      "Greece's first Leading Quality Trail — a quiet alternative to the Mykonos crowds.",
    alternativeTo: "Mykonos",
    image: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800&q=70&auto=format&fit=crop",
    sustainability: 9.7,
    sustainabilityNote: "Funds Stemnitsa & Dimitsana mountain villages",
    safety: { status: "safe", label: "Mild · 18°C, light breeze" },
  },
  {
    id: "samaria-east",
    name: "Aradena Gorge",
    region: "Sfakia, Crete",
    lat: 35.2253,
    lng: 24.0681,
    difficulty: "Strenuous",
    lengthKm: 7.6,
    elevationM: 650,
    durationH: 4,
    vibe: "Iron staircase descent into a wild Cretan gorge.",
    blurb:
      "Skip overrun Samaria — Aradena gives you the same drama with one-tenth the people.",
    alternativeTo: "Samaria Gorge",
    image: "https://images.unsplash.com/photo-1601581875309-fafbf2d3ed3a?w=800&q=70&auto=format&fit=crop",
    sustainability: 8.6,
    sustainabilityNote: "Supports Anopolis & Loutro family tavernas",
    safety: { status: "caution", label: "Caution: loose rock near iron stairs" },
  },
  {
    id: "olympus-enipeas",
    name: "Enipeas Canyon to Prionia",
    region: "Mt. Olympus, Macedonia",
    lat: 40.0859,
    lng: 22.3586,
    difficulty: "Strenuous",
    lengthKm: 10.2,
    elevationM: 950,
    durationH: 7,
    vibe: "Waterfalls and beech forest under the throne of Zeus.",
    blurb: "A mythic warm-up before the summit — and almost no one walks it.",
    image: "https://images.unsplash.com/photo-1486870591958-9b9d0d1dda99?w=800&q=70&auto=format&fit=crop",
    sustainability: 9.1,
    sustainabilityNote: "Refuge fees fund Olympus National Park rangers",
    safety: { status: "warning", label: "Warning: recent landslide near Prionia" },
  },
  {
    id: "tilos-loop",
    name: "Tilos Eristos Loop",
    region: "Dodecanese",
    lat: 36.4533,
    lng: 27.3681,
    difficulty: "Easy",
    lengthKm: 8.1,
    elevationM: 240,
    durationH: 3,
    vibe: "Wildflower terraces, abandoned village, empty Aegean coves.",
    blurb:
      "Greece's first carbon-neutral island. Like Santorini before tourism — and still affordable.",
    alternativeTo: "Santorini",
    image: "https://images.unsplash.com/photo-1533105079780-92b9be482077?w=800&q=70&auto=format&fit=crop",
    sustainability: 9.9,
    sustainabilityNote: "Carbon-neutral island · 100% local renewables",
    safety: { status: "safe", label: "Clear skies · ferry running" },
  },
  {
    id: "mainalon-elati",
    name: "Elati Plateau Loop",
    region: "Pindus, Thessaly",
    lat: 39.5586,
    lng: 21.4731,
    difficulty: "Easy",
    lengthKm: 6.4,
    elevationM: 180,
    durationH: 2,
    vibe: "Pine forest plateau, family-friendly, mushroom-rich in autumn.",
    blurb: "Perfect first day in the mountains. Local tavernas, no crowds.",
    image: "https://images.unsplash.com/photo-1448375240586-882707db888b?w=800&q=70&auto=format&fit=crop",
    sustainability: 8.8,
    sustainabilityNote: "Supports Elati & Pertouli forest cooperatives",
    safety: { status: "safe", label: "Cool & dry · ideal conditions" },
  },
  {
    id: "mt-pelion",
    name: "Centaur Path · Tsagarada to Mylopotamos",
    region: "Pelion, Thessaly",
    lat: 39.3961,
    lng: 23.2342,
    difficulty: "Moderate",
    lengthKm: 9.3,
    elevationM: 510,
    durationH: 4,
    vibe: "Cobbled kalderimi from chestnut forest down to a hidden cove.",
    blurb: "End at one of the most secret beaches in the Aegean.",
    alternativeTo: "Skiathos",
    image: "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800&q=70&auto=format&fit=crop",
    sustainability: 9.2,
    sustainabilityNote: "Restores ancient kalderimi stone paths",
    safety: { status: "caution", label: "Caution: afternoon thunderstorms forecast" },
  },
];

// Mock waypoint generator — placeholder for iNaturalist /v1/observations
// + Greek mountaineering refuge data.
function mockWaypoints(id: string): Waypoint[] {
  const presets: Record<string, Waypoint[]> = {
    "vikos-gorge": [
      { kind: "shelter", name: "Astraka Refuge", dLat: 0.018, dLng: -0.012 },
      { kind: "spring", name: "Drakolimni Spring", dLat: 0.005, dLng: 0.018 },
      { kind: "biodiversity", name: "Balkan chamois sighting", dLat: -0.012, dLng: 0.008 },
    ],
    "menalon": [
      { kind: "shelter", name: "Menalon Mountain Refuge", dLat: 0.014, dLng: 0.01 },
      { kind: "spring", name: "Lousios riverhead", dLat: -0.011, dLng: -0.006 },
      { kind: "biodiversity", name: "Griffon vulture nest", dLat: 0.006, dLng: -0.019 },
    ],
    "samaria-east": [
      { kind: "shelter", name: "Aradena bridge shelter", dLat: 0.009, dLng: -0.009 },
      { kind: "biodiversity", name: "Cretan dittany (endemic)", dLat: -0.008, dLng: 0.011 },
    ],
    "olympus-enipeas": [
      { kind: "shelter", name: "Refuge A — Spilios Agapitos", dLat: 0.02, dLng: 0.005 },
      { kind: "spring", name: "Enipeas waterfall pool", dLat: -0.01, dLng: -0.013 },
      { kind: "biodiversity", name: "Olympus violet (endemic)", dLat: 0.012, dLng: 0.014 },
    ],
    "tilos-loop": [
      { kind: "spring", name: "Eristos artesian well", dLat: 0.006, dLng: 0.01 },
      { kind: "biodiversity", name: "Monk seal cove", dLat: -0.014, dLng: -0.008 },
    ],
    "mainalon-elati": [
      { kind: "shelter", name: "Pertouli forest hut", dLat: 0.011, dLng: -0.012 },
      { kind: "biodiversity", name: "Wild boar tracks", dLat: -0.009, dLng: 0.014 },
    ],
    "mt-pelion": [
      { kind: "spring", name: "Mylopotamos cove spring", dLat: -0.013, dLng: 0.007 },
      { kind: "biodiversity", name: "Centaurea pelia (endemic)", dLat: 0.009, dLng: -0.011 },
      { kind: "shelter", name: "Tsagarada plane-tree square", dLat: 0.016, dLng: 0.012 },
    ],
  };
  return presets[id] ?? [];
}

// Higher-altitude trail → safer lower-altitude alternative for "Re-route for Rain".
const RAIN_ALTERNATIVES: Record<string, string> = {
  "olympus-enipeas": "mainalon-elati",
  "vikos-gorge": "mt-pelion",
  "samaria-east": "tilos-loop",
  "menalon": "mainalon-elati",
};

export const TRAILS: Trail[] = TRAILS_BASE.map((t, i) => ({
  ...t,
  route: mockRoute(t.lat, t.lng, i + 1),
  waypoints: mockWaypoints(t.id),
  rainAlternativeId: RAIN_ALTERNATIVES[t.id],
}));

export function getTrailById(id: string) {
  return TRAILS.find((t) => t.id === id);
}

const GREETING = `Kalimera! I'm Local Host - your Greek local travel companion. Tell me what you love (gorges, monasteries, secret coves, alpine summits, food villages) or which icon you want to escape (Santorini, Mykonos, Meteora, Samaria), and I'll route you to an authentic lower-crowd alternative.`;

// Lightweight mock assistant. Real Lovable AI can be wired in later.
export function mockAssistantReply(userMessage: string): {
  text: string;
  trailIds: string[];
} {
  const m = userMessage.toLowerCase().trim();
  if (!m || /^(hi|hello|hey|kalimera|yasou|γειά)/.test(m)) {
    return { text: GREETING, trailIds: [] };
  }

  const matches = TRAILS.filter((t) => {
    const hay = `${t.name} ${t.region} ${t.vibe} ${t.blurb} ${t.alternativeTo ?? ""} ${t.difficulty}`.toLowerCase();
    return m.split(/\s+/).some((w) => w.length > 2 && hay.includes(w));
  });

  const picks = (matches.length ? matches : TRAILS).slice(0, 3);
  const intro = matches.length
    ? `Here are ${picks.length} hidden-gem routes that match what you're after — all currently low-traffic:`
    : `Let's redirect you off the beaten path. Three trails worth your boots:`;

  const ids = picks.map((p) => p.id);
  return {
    text: `${intro}\n\n[[trails:${ids.join(",")}]]\n\nWant turn-by-turn details, the best season, or how to reach the trailhead by public transport?`,
    trailIds: ids,
  };
}

export const ASSISTANT_GREETING = GREETING;
