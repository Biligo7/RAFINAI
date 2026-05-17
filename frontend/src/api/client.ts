import { supabase } from "@/integrations/supabase/client";

export interface Chat {
  id: string;
  title: string;
  systemPrompt: string | null;
  model: string | null;
  temperature: number | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  chatId: string;
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tokenCount: number | null;
  provider: string | null;
  model: string | null;
  latencyMs: number | null;
  errorCode: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface AppConfigResponse {
  appName: string;
  environment: string;
  aiProvider: string;
  model: string;
  streamingEnabled: boolean;
  authEnabled: boolean;
}

export interface ImageAttachment {
  name: string;
  mediaType: string;
  dataUrl: string;
  thumbnailDataUrl?: string;
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const auth = await authHeaders();
  const res = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...auth,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    let message = `${res.status} ${res.statusText}`;
    try {
      const parsed = JSON.parse(body);
      if (parsed?.error?.message) message = parsed.error.message;
      if (parsed?.detail) message = parsed.detail;
    } catch {
      // ignore
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

type SseHandlers = {
  /** Fired once after a successful HTTP response, before reading the stream (user message is already persisted). */
  onOpen?: () => void;
  onToken: (delta: string) => void;
};

function parseSseBlock(block: string): { event: string; data: string } | null {
  let event = "";
  const dataLines: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
  }
  if (!event) return null;
  return { event, data: dataLines.join("\n") };
}

/**
 * POST /api/chats/:id/messages — streams SSE (token, message.completed, done, error).
 * Returns the final assistant text (from message.completed when present).
 */
export async function streamChatMessage(
  chatId: string,
  content: string,
  handlers: SseHandlers,
  images: ImageAttachment[] = [],
): Promise<string> {
  const auth = await authHeaders();
  const res = await fetch(`/api/chats/${chatId}/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...auth,
    },
    body: JSON.stringify({ content, images }),
  });
  if (!res.ok) {
    const body = await res.text();
    let message = `${res.status} ${res.statusText}`;
    try {
      const parsed = JSON.parse(body);
      if (parsed?.error?.message) message = parsed.error.message;
      if (parsed?.detail) message = parsed.detail;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  handlers.onOpen?.();

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";
  let fromTokens = "";
  let completed: string | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const raw of parts) {
      const block = raw.trim();
      if (!block) continue;
      const parsed = parseSseBlock(block);
      if (!parsed) continue;
      let payload: Record<string, unknown> = {};
      if (parsed.data) {
        try {
          payload = JSON.parse(parsed.data) as Record<string, unknown>;
        } catch {
          continue;
        }
      }
      if (parsed.event === "token" && typeof payload.delta === "string") {
        fromTokens += payload.delta;
        handlers.onToken(payload.delta);
      } else if (parsed.event === "message.completed" && typeof payload.content === "string") {
        completed = payload.content;
      } else if (parsed.event === "error") {
        const msg =
          typeof payload.message === "string" ? payload.message : "AI_PROVIDER_ERROR";
        throw new Error(msg);
      }
    }
  }

  return completed ?? fromTokens;
}

// --- Trail types (from backend /api/trails) ---

export interface TrailSafety {
  status: "safe" | "caution" | "warning";
  label: string;
}

export interface TrailWeather {
  condition: string;
  description: string;
  temp_c: number | null;
  feels_like_c: number | null;
  humidity: number | null;
  wind_speed_ms: number | null;
  clouds_pct: number;
  rain_next_24h: boolean;
  icon: string;
  fetched_at: string;
}

export interface TrailWaypoint {
  kind: "shelter" | "spring" | "biodiversity";
  name: string;
  dLat: number;
  dLng: number;
}

export interface ApiTrail {
  id: string;
  osmId?: number;
  name: string;
  region: string;
  lat: number;
  lng: number;
  difficulty: "Easy" | "Moderate" | "Strenuous";
  lengthKm: number;
  elevationM: number;
  durationH: number;
  blurb: string;
  vibe: string;
  image: string;
  sustainability: number;
  sustainabilityNote: string;
  safety: TrailSafety;
  route: [number, number][];
  waypoints: TrailWaypoint[];
  weather?: TrailWeather;
}

export interface TrailWeatherResponse {
  weather: TrailWeather;
  safety: TrailSafety;
  cached: boolean;
}

export interface PreferencesResponse {
  onboardingCompleted: boolean;
  preferences: string[] | null;
}

export const api = {
  getConfig: () => request<AppConfigResponse>("/api/config"),

  listChats: () =>
    request<{ chats: Chat[] }>("/api/chats").then((r) => r.chats),
  createChat: (title: string) =>
    request<Chat>("/api/chats", {
      method: "POST",
      body: JSON.stringify({ title }),
    }),
  renameChat: (id: string, title: string) =>
    request<Chat>(`/api/chats/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ title }),
    }),
  deleteChat: (id: string) =>
    request<void>(`/api/chats/${id}`, { method: "DELETE" }),

  listMessages: (chatId: string) =>
    request<{ messages: Message[] }>(`/api/chats/${chatId}/messages`).then(
      (r) => r.messages,
    ),

  saveMessage: (chatId: string, role: "user" | "assistant", content: string) =>
    request<Message>(`/api/chats/${chatId}/messages/save`, {
      method: "POST",
      body: JSON.stringify({ role, content }),
    }),

  getPreferences: () =>
    request<PreferencesResponse>("/api/users/me/preferences"),

  savePreferences: (preferences: string[]) =>
    request<PreferencesResponse>("/api/users/me/preferences", {
      method: "PUT",
      body: JSON.stringify({ preferences }),
    }),

  // --- Trails ---

  listTrails: (params?: { region?: string; difficulty?: string; limit?: number; refresh?: boolean; popular_only?: boolean }) => {
    const qs = new URLSearchParams();
    if (params?.region) qs.set("region", params.region);
    if (params?.difficulty) qs.set("difficulty", params.difficulty);
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.refresh) qs.set("refresh", "true");
    if (params?.popular_only === false) qs.set("popular_only", "false");
    const suffix = qs.toString() ? `?${qs}` : "";
    return request<{ trails: ApiTrail[]; source: string; total: number }>(`/api/trails${suffix}`);
  },

  getTrail: (id: string) => request<ApiTrail>(`/api/trails/${id}`),

  getTrailWeather: (id: string) =>
    request<TrailWeatherResponse>(`/api/trails/${id}/weather`),

  computeRoute: (id: string) =>
    request<ApiTrail>(`/api/trails/${id}/route`, { method: "POST" }),

  refreshTrails: () =>
    request<{ refreshed: number; source: string }>("/api/trails/refresh", { method: "POST" }),
};
