import { useCallback, useState } from "react";

export interface StreamingTurn {
  assistantMessageId: string | null;
  content: string;
  isStreaming: boolean;
  error: string | null;
}

const initialTurn: StreamingTurn = {
  assistantMessageId: null,
  content: "",
  isStreaming: false,
  error: null,
};

// Minimal SSE parser: splits buffered text on blank lines, then walks the
// `event:` / `data:` lines per block. This avoids EventSource (which only
// supports GET) so we can POST the user message in the same request.
function parseSseBlocks(buffer: string): { events: { event: string; data: string }[]; rest: string } {
  const events: { event: string; data: string }[] = [];
  let rest = buffer;
  while (true) {
    const sep = rest.indexOf("\n\n");
    if (sep === -1) break;
    const block = rest.slice(0, sep);
    rest = rest.slice(sep + 2);
    let event = "message";
    const dataLines: string[] = [];
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
    }
    if (dataLines.length > 0) events.push({ event, data: dataLines.join("\n") });
  }
  return { events, rest };
}

export function useStreamingChat() {
  const [turn, setTurn] = useState<StreamingTurn>(initialTurn);

  const send = useCallback(
    async (
      chatId: string,
      content: string,
      onComplete?: (assistantMessageId: string, content: string) => void,
    ) => {
      setTurn({ assistantMessageId: null, content: "", isStreaming: true, error: null });

      try {
        const res = await fetch(`/api/chats/${chatId}/messages`, {
          method: "POST",
          headers: { "content-type": "application/json", accept: "text/event-stream" },
          body: JSON.stringify({ content }),
        });

        if (!res.ok || !res.body) {
          const text = await res.text().catch(() => "");
          throw new Error(text || `${res.status} ${res.statusText}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let assistantMessageId: string | null = null;
        let full = "";
        let errorMessage: string | null = null;

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const { events, rest } = parseSseBlocks(buffer);
          buffer = rest;

          for (const evt of events) {
            try {
              const payload = JSON.parse(evt.data);
              switch (evt.event) {
                case "message.created":
                  assistantMessageId = payload.messageId ?? null;
                  setTurn((t) => ({ ...t, assistantMessageId }));
                  break;
                case "token":
                  if (typeof payload.delta === "string") {
                    full += payload.delta;
                    setTurn((t) => ({ ...t, content: full }));
                  }
                  break;
                case "message.completed":
                  if (typeof payload.content === "string") full = payload.content;
                  if (typeof payload.messageId === "string") assistantMessageId = payload.messageId;
                  setTurn((t) => ({ ...t, content: full, assistantMessageId }));
                  break;
                case "error":
                  errorMessage = typeof payload.message === "string" ? payload.message : "Provider error";
                  break;
                case "done":
                  break;
              }
            } catch {
              // Ignore malformed events.
            }
          }
        }

        setTurn({
          assistantMessageId,
          content: full,
          isStreaming: false,
          error: errorMessage,
        });
        if (assistantMessageId && !errorMessage && onComplete) onComplete(assistantMessageId, full);
      } catch (err) {
        setTurn({
          assistantMessageId: null,
          content: "",
          isStreaming: false,
          error: err instanceof Error ? err.message : "Streaming error",
        });
      }
    },
    [],
  );

  const reset = useCallback(() => setTurn(initialTurn), []);

  return { turn, send, reset };
}
