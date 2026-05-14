import { v4 as uuid } from "uuid";
import { getPool } from "./pool.js";
import type {
  Chat,
  Message,
  MessageFeedback,
  Role,
  TrainingDataset,
  TrainingExample,
} from "../types/api.js";

type ChatRow = {
  id: string;
  user_id: string | null;
  title: string;
  system_prompt: string | null;
  model: string | null;
  temperature: number | null;
  archived_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

type MessageRow = {
  id: string;
  chat_id: string;
  role: string;
  content: string;
  token_count: number | null;
  provider: string | null;
  model: string | null;
  latency_ms: number | null;
  error_code: string | null;
  metadata_json: string | null;
  created_at: Date;
};

type FeedbackRow = {
  id: string;
  message_id: string;
  rating: number;
  comment: string | null;
  created_at: Date;
};

type DatasetRow = {
  id: string;
  name: string;
  description: string | null;
  created_at: Date;
  updated_at: Date;
};

type ExampleRow = {
  id: string;
  dataset_id: string | null;
  source_chat_id: string | null;
  source_user_message_id: string | null;
  source_assistant_message_id: string | null;
  input_text: string;
  expected_output_text: string;
  tags_json: string | null;
  metadata_json: string | null;
  created_at: Date;
};

function chatFromRow(r: ChatRow): Chat {
  return {
    id: r.id,
    title: r.title,
    systemPrompt: r.system_prompt,
    model: r.model,
    temperature: r.temperature !== null ? Number(r.temperature) : null,
    archivedAt: r.archived_at?.toISOString() ?? null,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

function messageFromRow(r: MessageRow): Message {
  return {
    id: r.id,
    chatId: r.chat_id,
    role: r.role as Role,
    content: r.content,
    tokenCount: r.token_count,
    provider: r.provider,
    model: r.model,
    latencyMs: r.latency_ms,
    errorCode: r.error_code,
    metadata: r.metadata_json ? safeJson(r.metadata_json) : null,
    createdAt: r.created_at.toISOString(),
  };
}

function feedbackFromRow(r: FeedbackRow): MessageFeedback {
  return {
    id: r.id,
    messageId: r.message_id,
    rating: r.rating === 1 ? 1 : -1,
    comment: r.comment,
    createdAt: r.created_at.toISOString(),
  };
}

function datasetFromRow(r: DatasetRow): TrainingDataset {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

function exampleFromRow(r: ExampleRow): TrainingExample {
  const tags = r.tags_json ? safeJson<string[]>(r.tags_json) : null;
  return {
    id: r.id,
    datasetId: r.dataset_id,
    sourceChatId: r.source_chat_id,
    sourceUserMessageId: r.source_user_message_id,
    sourceAssistantMessageId: r.source_assistant_message_id,
    inputText: r.input_text,
    expectedOutputText: r.expected_output_text,
    tags: Array.isArray(tags) ? tags : null,
    metadata: r.metadata_json ? safeJson(r.metadata_json) : null,
    createdAt: r.created_at.toISOString(),
  };
}

function safeJson<T = unknown>(s: string): T | null {
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

export async function listChats(): Promise<Chat[]> {
  const pool = await getPool();
  const result = await pool.query<ChatRow>(
    `SELECT id, user_id, title, system_prompt, model, temperature, archived_at, created_at, updated_at
     FROM chats
     WHERE archived_at IS NULL
     ORDER BY updated_at DESC`,
  );
  return result.rows.map(chatFromRow);
}

export async function createChat(input: { title: string; systemPrompt?: string | null }): Promise<Chat> {
  const pool = await getPool();
  const id = uuid();
  await pool.query(
    `INSERT INTO chats (id, title, system_prompt) VALUES ($1, $2, $3)`,
    [id, input.title, input.systemPrompt ?? null],
  );
  const created = await getChat(id);
  if (!created) throw new Error("Chat insert succeeded but row not found");
  return created;
}

export async function getChat(id: string): Promise<Chat | null> {
  const pool = await getPool();
  const result = await pool.query<ChatRow>(
    `SELECT id, user_id, title, system_prompt, model, temperature, archived_at, created_at, updated_at
     FROM chats WHERE id = $1`,
    [id],
  );
  const row = result.rows[0];
  return row ? chatFromRow(row) : null;
}

export async function updateChat(
  id: string,
  patch: { title?: string; systemPrompt?: string | null },
): Promise<Chat | null> {
  const pool = await getPool();
  const setParts: string[] = ["updated_at = now()"];
  const values: unknown[] = [];
  if (patch.title !== undefined) {
    values.push(patch.title);
    setParts.push(`title = $${values.length}`);
  }
  if (patch.systemPrompt !== undefined) {
    values.push(patch.systemPrompt);
    setParts.push(`system_prompt = $${values.length}`);
  }
  values.push(id);
  await pool.query(
    `UPDATE chats SET ${setParts.join(", ")} WHERE id = $${values.length}`,
    values,
  );
  return getChat(id);
}

export async function archiveChat(id: string): Promise<void> {
  const pool = await getPool();
  await pool.query(
    `UPDATE chats SET archived_at = now(), updated_at = now() WHERE id = $1`,
    [id],
  );
}

export async function listMessages(chatId: string): Promise<Message[]> {
  const pool = await getPool();
  const result = await pool.query<MessageRow>(
    `SELECT id, chat_id, role, content, token_count, provider, model, latency_ms, error_code, metadata_json, created_at
     FROM messages
     WHERE chat_id = $1
     ORDER BY created_at ASC`,
    [chatId],
  );
  return result.rows.map(messageFromRow);
}

export async function getMessage(id: string): Promise<Message | null> {
  const pool = await getPool();
  const result = await pool.query<MessageRow>(
    `SELECT id, chat_id, role, content, token_count, provider, model, latency_ms, error_code, metadata_json, created_at
     FROM messages WHERE id = $1`,
    [id],
  );
  const row = result.rows[0];
  return row ? messageFromRow(row) : null;
}

export async function insertMessage(input: {
  id?: string;
  chatId: string;
  role: Role;
  content: string;
  provider?: string | null;
  model?: string | null;
  latencyMs?: number | null;
  errorCode?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<Message> {
  const pool = await getPool();
  const id = input.id ?? uuid();
  await pool.query(
    `INSERT INTO messages (id, chat_id, role, content, provider, model, latency_ms, error_code, metadata_json)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      id,
      input.chatId,
      input.role,
      input.content,
      input.provider ?? null,
      input.model ?? null,
      input.latencyMs ?? null,
      input.errorCode ?? null,
      input.metadata ? JSON.stringify(input.metadata) : null,
    ],
  );

  // Touch the chat's updated_at so the sidebar sort is stable.
  await pool.query(`UPDATE chats SET updated_at = now() WHERE id = $1`, [input.chatId]);

  const message = await getMessage(id);
  if (!message) throw new Error("Message insert succeeded but row not found");
  return message;
}

export async function upsertFeedback(input: {
  messageId: string;
  rating: -1 | 1;
  comment?: string | null;
}): Promise<MessageFeedback> {
  const pool = await getPool();
  const id = uuid();
  await pool.query(
    `INSERT INTO message_feedback (id, message_id, rating, comment) VALUES ($1, $2, $3, $4)`,
    [id, input.messageId, input.rating, input.comment ?? null],
  );
  const result = await pool.query<FeedbackRow>(
    `SELECT id, message_id, rating, comment, created_at FROM message_feedback WHERE id = $1`,
    [id],
  );
  const row = result.rows[0];
  if (!row) throw new Error("Feedback insert succeeded but row not found");
  return feedbackFromRow(row);
}

export async function listDatasets(): Promise<TrainingDataset[]> {
  const pool = await getPool();
  const result = await pool.query<DatasetRow>(
    `SELECT id, name, description, created_at, updated_at FROM training_datasets ORDER BY updated_at DESC`,
  );
  return result.rows.map(datasetFromRow);
}

export async function createDataset(input: { name: string; description?: string | null }): Promise<TrainingDataset> {
  const pool = await getPool();
  const id = uuid();
  await pool.query(
    `INSERT INTO training_datasets (id, name, description) VALUES ($1, $2, $3)`,
    [id, input.name, input.description ?? null],
  );
  const result = await pool.query<DatasetRow>(
    `SELECT id, name, description, created_at, updated_at FROM training_datasets WHERE id = $1`,
    [id],
  );
  const row = result.rows[0];
  if (!row) throw new Error("Dataset insert succeeded but row not found");
  return datasetFromRow(row);
}

export async function listExamples(opts: { datasetId?: string | null; limit?: number } = {}): Promise<TrainingExample[]> {
  const pool = await getPool();
  const limit = Math.min(Math.max(opts.limit ?? 1000, 1), 10_000);
  const values: unknown[] = [];
  let where = "";
  if (opts.datasetId) {
    values.push(opts.datasetId);
    where = `WHERE dataset_id = $${values.length}`;
  }
  values.push(limit);
  const result = await pool.query<ExampleRow>(
    `SELECT id, dataset_id, source_chat_id, source_user_message_id, source_assistant_message_id,
            input_text, expected_output_text, tags_json, metadata_json, created_at
     FROM training_examples
     ${where}
     ORDER BY created_at DESC
     LIMIT $${values.length}`,
    values,
  );
  return result.rows.map(exampleFromRow);
}

export async function createExample(input: {
  datasetId?: string | null;
  sourceChatId?: string | null;
  sourceUserMessageId?: string | null;
  sourceAssistantMessageId?: string | null;
  inputText: string;
  expectedOutputText: string;
  tags?: string[] | null;
  metadata?: Record<string, unknown> | null;
}): Promise<TrainingExample> {
  const pool = await getPool();
  const id = uuid();
  await pool.query(
    `INSERT INTO training_examples
       (id, dataset_id, source_chat_id, source_user_message_id, source_assistant_message_id,
        input_text, expected_output_text, tags_json, metadata_json)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      id,
      input.datasetId ?? null,
      input.sourceChatId ?? null,
      input.sourceUserMessageId ?? null,
      input.sourceAssistantMessageId ?? null,
      input.inputText,
      input.expectedOutputText,
      input.tags ? JSON.stringify(input.tags) : null,
      input.metadata ? JSON.stringify(input.metadata) : null,
    ],
  );

  const result = await pool.query<ExampleRow>(
    `SELECT id, dataset_id, source_chat_id, source_user_message_id, source_assistant_message_id,
            input_text, expected_output_text, tags_json, metadata_json, created_at
     FROM training_examples WHERE id = $1`,
    [id],
  );
  const row = result.rows[0];
  if (!row) throw new Error("Example insert succeeded but row not found");
  return exampleFromRow(row);
}

export async function recordEvent(input: {
  requestId?: string | null;
  eventType: string;
  severity: "info" | "warn" | "error";
  message?: string | null;
  properties?: Record<string, unknown> | null;
}): Promise<void> {
  const pool = await getPool();
  await pool.query(
    `INSERT INTO app_events (request_id, event_type, severity, message, properties_json)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      input.requestId ?? null,
      input.eventType,
      input.severity,
      input.message ?? null,
      input.properties ? JSON.stringify(input.properties) : null,
    ],
  );
}
