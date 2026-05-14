import { v4 as uuid } from "uuid";
import { config } from "../config.js";
import { logger } from "../logger.js";
import { getRepository } from "../db/repository.js";
import type { Message } from "../types/api.js";
import { getAIProvider, type ChatCompletionMessage } from "./ai/aiClient.js";

export interface StreamingChatResult {
  assistantMessageId: string;
  full: string;
  latencyMs: number;
}

export interface StreamChatHandlers {
  onAssistantStart(messageId: string): void;
  onToken(delta: string): void;
}

export async function generateChatResponse(args: {
  chatId: string;
  userMessage: Message;
  requestId: string;
  handlers: StreamChatHandlers;
}): Promise<StreamingChatResult> {
  const repo = getRepository();
  const provider = getAIProvider();

  const chat = await repo.getChat(args.chatId);
  if (!chat) throw new Error(`Chat ${args.chatId} not found`);

  const history = await repo.listMessages(args.chatId);

  const systemPrompt = chat.systemPrompt || config.ai.systemPrompt;
  const recent = history.slice(-config.ai.maxHistoryMessages);

  const messages: ChatCompletionMessage[] = [
    { role: "system", content: systemPrompt },
    ...recent
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m): ChatCompletionMessage => ({ role: m.role as "user" | "assistant", content: m.content })),
  ];

  // Trim oldest history entries until we are under the input character cap.
  while (totalChars(messages) > config.ai.maxInputChars && messages.length > 2) {
    messages.splice(1, 1);
  }

  const assistantMessageId = uuid();
  args.handlers.onAssistantStart(assistantMessageId);

  const start = Date.now();
  let full = "";

  try {
    for await (const token of provider.streamChatCompletion({
      messages,
      model: config.ai.model,
      temperature: config.ai.temperature,
      maxTokens: config.ai.maxTokens,
      requestId: args.requestId,
    })) {
      full += token;
      args.handlers.onToken(token);
    }
  } catch (err) {
    const latencyMs = Date.now() - start;
    logger.error({ requestId: args.requestId, chatId: args.chatId, err, latencyMs }, "AI provider error");
    await repo
      .insertMessage({
        id: assistantMessageId,
        chatId: args.chatId,
        role: "assistant",
        content: full,
        provider: provider.name,
        model: config.ai.model,
        latencyMs,
        errorCode: "AI_PROVIDER_ERROR",
      })
      .catch((dbErr) => logger.error({ dbErr }, "Failed to persist failed assistant message"));
    throw err;
  }

  const latencyMs = Date.now() - start;

  await repo.insertMessage({
    id: assistantMessageId,
    chatId: args.chatId,
    role: "assistant",
    content: full,
    provider: provider.name,
    model: config.ai.model,
    latencyMs,
  });

  logger.info(
    {
      requestId: args.requestId,
      event: "chat.completion.completed",
      chatId: args.chatId,
      provider: provider.name,
      model: config.ai.model,
      latencyMs,
    },
    "Completion finished",
  );

  return { assistantMessageId, full, latencyMs };
}

function totalChars(messages: ChatCompletionMessage[]): number {
  return messages.reduce((sum, m) => sum + m.content.length, 0);
}
