export type Role = "system" | "user" | "assistant" | "tool";

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
  role: Role;
  content: string;
  tokenCount: number | null;
  provider: string | null;
  model: string | null;
  latencyMs: number | null;
  errorCode: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface MessageFeedback {
  id: string;
  messageId: string;
  rating: -1 | 1;
  comment: string | null;
  createdAt: string;
}

export interface TrainingDataset {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TrainingExample {
  id: string;
  datasetId: string | null;
  sourceChatId: string | null;
  sourceUserMessageId: string | null;
  sourceAssistantMessageId: string | null;
  inputText: string;
  expectedOutputText: string;
  tags: string[] | null;
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

export type ErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "DATABASE_ERROR"
  | "AI_PROVIDER_ERROR"
  | "UNAUTHORIZED"
  | "INTERNAL_ERROR";

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    requestId: string;
  };
}
