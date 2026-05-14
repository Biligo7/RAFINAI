import { v4 as uuid } from "uuid";
import type {
  Chat,
  Message,
  MessageFeedback,
  Role,
  TrainingDataset,
  TrainingExample,
} from "../types/api.js";

// In-memory fallback used when SQL is not configured (e.g. fresh smoke tests
// before infrastructure is provisioned). State is per-process; restarting the
// container clears everything. Do not use in production.

interface State {
  chats: Map<string, Chat>;
  messages: Map<string, Message>;
  feedback: Map<string, MessageFeedback>;
  datasets: Map<string, TrainingDataset>;
  examples: Map<string, TrainingExample>;
}

const state: State = {
  chats: new Map(),
  messages: new Map(),
  feedback: new Map(),
  datasets: new Map(),
  examples: new Map(),
};

function nowIso(): string {
  return new Date().toISOString();
}

export const memory = {
  listChats(): Chat[] {
    return [...state.chats.values()]
      .filter((c) => !c.archivedAt)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },
  createChat(input: { title: string; systemPrompt?: string | null }): Chat {
    const chat: Chat = {
      id: uuid(),
      title: input.title,
      systemPrompt: input.systemPrompt ?? null,
      model: null,
      temperature: null,
      archivedAt: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    state.chats.set(chat.id, chat);
    return chat;
  },
  getChat(id: string): Chat | null {
    return state.chats.get(id) ?? null;
  },
  updateChat(id: string, patch: { title?: string; systemPrompt?: string | null }): Chat | null {
    const chat = state.chats.get(id);
    if (!chat) return null;
    const next: Chat = {
      ...chat,
      title: patch.title ?? chat.title,
      systemPrompt: patch.systemPrompt === undefined ? chat.systemPrompt : patch.systemPrompt,
      updatedAt: nowIso(),
    };
    state.chats.set(id, next);
    return next;
  },
  archiveChat(id: string): void {
    const chat = state.chats.get(id);
    if (!chat) return;
    state.chats.set(id, { ...chat, archivedAt: nowIso(), updatedAt: nowIso() });
  },
  listMessages(chatId: string): Message[] {
    return [...state.messages.values()]
      .filter((m) => m.chatId === chatId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },
  getMessage(id: string): Message | null {
    return state.messages.get(id) ?? null;
  },
  insertMessage(input: {
    id?: string;
    chatId: string;
    role: Role;
    content: string;
    provider?: string | null;
    model?: string | null;
    latencyMs?: number | null;
    errorCode?: string | null;
    metadata?: Record<string, unknown> | null;
  }): Message {
    const id = input.id ?? uuid();
    const message: Message = {
      id,
      chatId: input.chatId,
      role: input.role,
      content: input.content,
      tokenCount: null,
      provider: input.provider ?? null,
      model: input.model ?? null,
      latencyMs: input.latencyMs ?? null,
      errorCode: input.errorCode ?? null,
      metadata: input.metadata ?? null,
      createdAt: nowIso(),
    };
    state.messages.set(id, message);
    const chat = state.chats.get(input.chatId);
    if (chat) state.chats.set(chat.id, { ...chat, updatedAt: nowIso() });
    return message;
  },
  upsertFeedback(input: { messageId: string; rating: -1 | 1; comment?: string | null }): MessageFeedback {
    const fb: MessageFeedback = {
      id: uuid(),
      messageId: input.messageId,
      rating: input.rating,
      comment: input.comment ?? null,
      createdAt: nowIso(),
    };
    state.feedback.set(fb.id, fb);
    return fb;
  },
  listDatasets(): TrainingDataset[] {
    return [...state.datasets.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },
  createDataset(input: { name: string; description?: string | null }): TrainingDataset {
    const ds: TrainingDataset = {
      id: uuid(),
      name: input.name,
      description: input.description ?? null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    state.datasets.set(ds.id, ds);
    return ds;
  },
  listExamples(opts: { datasetId?: string | null; limit?: number } = {}): TrainingExample[] {
    let examples = [...state.examples.values()];
    if (opts.datasetId) examples = examples.filter((e) => e.datasetId === opts.datasetId);
    examples.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (opts.limit) examples = examples.slice(0, opts.limit);
    return examples;
  },
  createExample(input: {
    datasetId?: string | null;
    sourceChatId?: string | null;
    sourceUserMessageId?: string | null;
    sourceAssistantMessageId?: string | null;
    inputText: string;
    expectedOutputText: string;
    tags?: string[] | null;
    metadata?: Record<string, unknown> | null;
  }): TrainingExample {
    const ex: TrainingExample = {
      id: uuid(),
      datasetId: input.datasetId ?? null,
      sourceChatId: input.sourceChatId ?? null,
      sourceUserMessageId: input.sourceUserMessageId ?? null,
      sourceAssistantMessageId: input.sourceAssistantMessageId ?? null,
      inputText: input.inputText,
      expectedOutputText: input.expectedOutputText,
      tags: input.tags ?? null,
      metadata: input.metadata ?? null,
      createdAt: nowIso(),
    };
    state.examples.set(ex.id, ex);
    return ex;
  },
  recordEvent(_input: unknown): void {
    // no-op for in-memory
  },
  reset(): void {
    state.chats.clear();
    state.messages.clear();
    state.feedback.clear();
    state.datasets.clear();
    state.examples.clear();
  },
};
