export interface ChatCompletionMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AIProvider {
  readonly name: string;
  streamChatCompletion(args: {
    messages: ChatCompletionMessage[];
    model: string;
    temperature: number;
    maxTokens: number;
    requestId: string;
  }): AsyncGenerator<string>;
}

import { config } from "../../config.js";
import { logger } from "../../logger.js";
import { mockProvider } from "./mockProvider.js";
import { createAzureOpenAIProvider } from "./azureOpenAIProvider.js";
import { createOpenAIProvider } from "./openAIProvider.js";

let cachedProvider: AIProvider | null = null;

export function getAIProvider(): AIProvider {
  if (cachedProvider) return cachedProvider;

  switch (config.ai.provider) {
    case "azure_openai": {
      cachedProvider = createAzureOpenAIProvider({
        endpoint: config.ai.azureOpenAI.endpoint,
        apiKey: config.ai.azureOpenAI.apiKey,
        deployment: config.ai.azureOpenAI.deployment,
        apiVersion: config.ai.azureOpenAI.apiVersion,
      });
      break;
    }
    case "openai_compatible": {
      cachedProvider = createOpenAIProvider({
        apiKey: config.ai.openAI.apiKey,
        baseUrl: config.ai.openAI.baseUrl,
        defaultModel: config.ai.openAI.model,
      });
      break;
    }
    case "mock":
    default:
      cachedProvider = mockProvider;
      break;
  }

  logger.info({ provider: cachedProvider.name, model: config.ai.model }, "AI provider selected");
  return cachedProvider;
}

export function resetAIProviderForTests(): void {
  cachedProvider = null;
}
