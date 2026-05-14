import type {
  AppConfigResponse,
  Chat,
  Message,
  TrainingDataset,
  TrainingExample,
} from "../types/api.js";

// All API calls use relative URLs so the browser only ever talks to the
// frontend origin. The Nginx (or Vite dev) proxy forwards /api/* to the backend.

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    let message = `${res.status} ${res.statusText}`;
    try {
      const parsed = JSON.parse(body);
      if (parsed?.error?.message) message = parsed.error.message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  getConfig: () => request<AppConfigResponse>("/api/config"),

  listChats: () => request<{ chats: Chat[] }>("/api/chats").then((r) => r.chats),
  createChat: (title: string) =>
    request<Chat>("/api/chats", { method: "POST", body: JSON.stringify({ title }) }),
  renameChat: (id: string, title: string) =>
    request<Chat>(`/api/chats/${id}`, { method: "PATCH", body: JSON.stringify({ title }) }),
  deleteChat: (id: string) => request<void>(`/api/chats/${id}`, { method: "DELETE" }),

  listMessages: (chatId: string) =>
    request<{ messages: Message[] }>(`/api/chats/${chatId}/messages`).then((r) => r.messages),

  sendFeedback: (messageId: string, rating: -1 | 1, comment?: string) =>
    request(`/api/messages/${messageId}/feedback`, {
      method: "POST",
      body: JSON.stringify({ rating, comment: comment ?? null }),
    }),

  listDatasets: () =>
    request<{ datasets: TrainingDataset[] }>("/api/training/datasets").then((r) => r.datasets),
  createDataset: (name: string, description?: string) =>
    request<TrainingDataset>("/api/training/datasets", {
      method: "POST",
      body: JSON.stringify({ name, description: description ?? null }),
    }),
  listExamples: (datasetId?: string) => {
    const qs = datasetId ? `?datasetId=${encodeURIComponent(datasetId)}` : "";
    return request<{ examples: TrainingExample[] }>(`/api/training/examples${qs}`).then(
      (r) => r.examples,
    );
  },
  createExample: (input: {
    datasetId?: string | null;
    sourceChatId?: string | null;
    sourceUserMessageId?: string | null;
    sourceAssistantMessageId?: string | null;
    inputText: string;
    expectedOutputText: string;
    tags?: string[];
  }) =>
    request<TrainingExample>("/api/training/examples", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  exportJsonlUrl: (datasetId?: string) => {
    const qs = datasetId ? `?datasetId=${encodeURIComponent(datasetId)}` : "";
    return `/api/training/export.jsonl${qs}`;
  },
};
