import OpenAI from "openai";
import type { AIProvider } from "./aiClient.js";
import { logger } from "../../logger.js";

export function createOpenAIProvider(opts: {
  apiKey: string;
  baseUrl: string;
  defaultModel: string;
}): AIProvider {
  if (!opts.apiKey) {
    logger.warn("OpenAI-compatible provider selected but OPENAI_API_KEY is empty; calls will fail at runtime");
  }

  let client: OpenAI | null = null;
  function getClient(): OpenAI {
    if (client) return client;
    client = new OpenAI({
      apiKey: opts.apiKey || "missing",
      baseURL: opts.baseUrl || undefined,
    });
    return client;
  }

  return {
    name: "openai_compatible",
    streamChatCompletion: async function* ({ messages, model, temperature, maxTokens }) {
      const stream = await getClient().chat.completions.create({
        model: opts.defaultModel || model,
        messages,
        temperature,
        max_tokens: maxTokens,
        stream: true,
      });

      for await (const chunk of stream) {
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) yield delta;
      }
    },
  };
}
