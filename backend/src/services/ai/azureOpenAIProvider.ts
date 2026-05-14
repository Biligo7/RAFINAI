import { AzureOpenAI } from "openai";
import type { AIProvider } from "./aiClient.js";
import { logger } from "../../logger.js";

export function createAzureOpenAIProvider(opts: {
  endpoint: string;
  apiKey: string;
  deployment: string;
  apiVersion: string;
}): AIProvider {
  if (!opts.endpoint || !opts.apiKey || !opts.deployment) {
    logger.warn(
      { hasEndpoint: !!opts.endpoint, hasApiKey: !!opts.apiKey, hasDeployment: !!opts.deployment },
      "Azure OpenAI provider selected but configuration is incomplete; calls will fail at runtime",
    );
  }

  // Lazily create the client so missing config does not crash startup.
  let client: AzureOpenAI | null = null;
  function getClient(): AzureOpenAI {
    if (client) return client;
    client = new AzureOpenAI({
      endpoint: opts.endpoint,
      apiKey: opts.apiKey,
      apiVersion: opts.apiVersion,
      deployment: opts.deployment,
    });
    return client;
  }

  return {
    name: "azure_openai",
    streamChatCompletion: async function* ({ messages, temperature, maxTokens }) {
      const stream = await getClient().chat.completions.create({
        model: opts.deployment,
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
