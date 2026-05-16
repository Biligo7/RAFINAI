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

type StreamHandlers = {
  onToken?: (delta: string) => void;
  onMessageCreated?: (messageId: string) => void;
  onCompleted?: (content: string) => void;
};

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

function parseSseEvent(raw: string): { event: string; data: unknown } | null {
  let event = "message";
  const dataLines: string[] = [];

  for (const line of raw.split(/\r?\n/)) {
    if (line.startsWith("event:")) {
      event = line.slice("event:".length).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trimStart());
    }
  }

  if (dataLines.length === 0) return null;

  try {
    return { event, data: JSON.parse(dataLines.join("\n")) };
  } catch {
    return null;
  }
}

async function readSseStream(
  stream: ReadableStream<Uint8Array>,
  handlers: StreamHandlers,
) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    let separator = buffer.match(/\r?\n\r?\n/);
    while (separator?.index !== undefined) {
      const boundary = separator.index;
      const raw = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + separator[0].length);
      const parsed = parseSseEvent(raw);
      if (parsed) {
        const data = parsed.data as Record<string, unknown>;
        if (parsed.event === "message.created" && typeof data.messageId === "string") {
          handlers.onMessageCreated?.(data.messageId);
        } else if (parsed.event === "token" && typeof data.delta === "string") {
          handlers.onToken?.(data.delta);
        } else if (parsed.event === "message.completed" && typeof data.content === "string") {
          handlers.onCompleted?.(data.content);
        } else if (parsed.event === "error") {
          throw new Error(
            typeof data.message === "string" ? data.message : "AI provider error",
          );
        }
      }
      separator = buffer.match(/\r?\n\r?\n/);
    }
  }
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

  sendMessage: async (
    chatId: string,
    content: string,
    handlers: StreamHandlers = {},
  ) => {
    const auth = await authHeaders();
    const res = await fetch(`/api/chats/${chatId}/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...auth,
      },
      body: JSON.stringify({ content }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(body || `${res.status} ${res.statusText}`);
    }
    if (!res.body) throw new Error("Streaming is not supported by this browser");

    await readSseStream(res.body, handlers);
  },
};
