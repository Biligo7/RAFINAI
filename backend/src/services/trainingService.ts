import { config } from "../config.js";
import { getRepository } from "../db/repository.js";
import type { TrainingExample } from "../types/api.js";

// Each line is a chat-completions style fine-tuning record:
// { "messages": [ {"role":"system",...}, {"role":"user",...}, {"role":"assistant",...} ] }
export function exampleToJsonl(example: TrainingExample, systemPrompt: string): string {
  const record = {
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: example.inputText },
      { role: "assistant", content: example.expectedOutputText },
    ],
    metadata: {
      exampleId: example.id,
      datasetId: example.datasetId,
      sourceChatId: example.sourceChatId,
      tags: example.tags,
    },
  };
  return JSON.stringify(record);
}

export async function* streamExportJsonl(opts: { datasetId?: string | null } = {}): AsyncGenerator<string> {
  const repo = getRepository();
  const examples = await repo.listExamples({ datasetId: opts.datasetId, limit: 10_000 });
  for (const example of examples) {
    yield `${exampleToJsonl(example, config.ai.systemPrompt)}\n`;
  }
}
