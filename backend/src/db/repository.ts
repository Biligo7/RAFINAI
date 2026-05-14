import { config } from "../config.js";
import { logger } from "../logger.js";
import * as queries from "./queries.js";
import { memory } from "./memoryStore.js";
import type {
  Chat,
  Message,
  MessageFeedback,
  Role,
  TrainingDataset,
  TrainingExample,
} from "../types/api.js";

// Repository facade. Dispatches to Postgres when configured, falls back to an
// in-memory store otherwise. The fallback exists so the app runs without any
// database during smoke tests.

export interface Repository {
  listChats(): Promise<Chat[]>;
  createChat(input: { title: string; systemPrompt?: string | null }): Promise<Chat>;
  getChat(id: string): Promise<Chat | null>;
  updateChat(id: string, patch: { title?: string; systemPrompt?: string | null }): Promise<Chat | null>;
  archiveChat(id: string): Promise<void>;

  listMessages(chatId: string): Promise<Message[]>;
  getMessage(id: string): Promise<Message | null>;
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
  }): Promise<Message>;

  upsertFeedback(input: { messageId: string; rating: -1 | 1; comment?: string | null }): Promise<MessageFeedback>;

  listDatasets(): Promise<TrainingDataset[]>;
  createDataset(input: { name: string; description?: string | null }): Promise<TrainingDataset>;
  listExamples(opts?: { datasetId?: string | null; limit?: number }): Promise<TrainingExample[]>;
  createExample(input: {
    datasetId?: string | null;
    sourceChatId?: string | null;
    sourceUserMessageId?: string | null;
    sourceAssistantMessageId?: string | null;
    inputText: string;
    expectedOutputText: string;
    tags?: string[] | null;
    metadata?: Record<string, unknown> | null;
  }): Promise<TrainingExample>;

  recordEvent(input: {
    requestId?: string | null;
    eventType: string;
    severity: "info" | "warn" | "error";
    message?: string | null;
    properties?: Record<string, unknown> | null;
  }): Promise<void>;
}

const sqlRepo: Repository = {
  listChats: () => queries.listChats(),
  createChat: (input) => queries.createChat(input),
  getChat: (id) => queries.getChat(id),
  updateChat: (id, patch) => queries.updateChat(id, patch),
  archiveChat: (id) => queries.archiveChat(id),
  listMessages: (chatId) => queries.listMessages(chatId),
  getMessage: (id) => queries.getMessage(id),
  insertMessage: (input) => queries.insertMessage(input),
  upsertFeedback: (input) => queries.upsertFeedback(input),
  listDatasets: () => queries.listDatasets(),
  createDataset: (input) => queries.createDataset(input),
  listExamples: (opts) => queries.listExamples(opts ?? {}),
  createExample: (input) => queries.createExample(input),
  recordEvent: (input) => queries.recordEvent(input),
};

const memoryRepo: Repository = {
  listChats: async () => memory.listChats(),
  createChat: async (input) => memory.createChat(input),
  getChat: async (id) => memory.getChat(id),
  updateChat: async (id, patch) => memory.updateChat(id, patch),
  archiveChat: async (id) => memory.archiveChat(id),
  listMessages: async (chatId) => memory.listMessages(chatId),
  getMessage: async (id) => memory.getMessage(id),
  insertMessage: async (input) => memory.insertMessage(input),
  upsertFeedback: async (input) => memory.upsertFeedback(input),
  listDatasets: async () => memory.listDatasets(),
  createDataset: async (input) => memory.createDataset(input),
  listExamples: async (opts) => memory.listExamples(opts ?? {}),
  createExample: async (input) => memory.createExample(input),
  recordEvent: async () => undefined,
};

export function getRepository(): Repository {
  if (config.sql.enabled) return sqlRepo;
  return memoryRepo;
}

export function logRepositoryMode(): void {
  if (config.sql.enabled) {
    logger.info({ mode: "postgres", host: config.sql.host }, "Repository: Postgres");
  } else {
    logger.warn({ mode: "memory" }, "Repository: in-memory fallback (Postgres not configured)");
  }
}
