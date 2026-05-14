import type { AIProvider, ChatCompletionMessage } from "./aiClient.js";

const CANNED_RESPONSE =
  "This is a mock answer streamed token by token. Replace AI_PROVIDER with azure_openai or openai_compatible to call a real model.";

async function* generate(messages: ChatCompletionMessage[]): AsyncGenerator<string> {
  // Echo a hint of the user's last message so smoke tests see something concrete.
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const preface = lastUser
    ? `Mock reply to: "${lastUser.content.slice(0, 80).replace(/\s+/g, " ")}"\n\n`
    : "";
  const full = preface + CANNED_RESPONSE;

  const tokens = full.split(/(\s+)/);
  for (const token of tokens) {
    if (token.length === 0) continue;
    await new Promise((r) => setTimeout(r, 20));
    yield token;
  }
}

export const mockProvider: AIProvider = {
  name: "mock",
  streamChatCompletion: async function* ({ messages }) {
    yield* generate(messages);
  },
};
