import { useEffect, useRef, useState } from "react";
import { api } from "../api/client.js";
import type { Message } from "../types/api.js";

interface Props {
  messages: Message[];
  streaming?: { assistantMessageId: string | null; content: string; isStreaming: boolean };
  onSaveExample?: (userMessage: Message, assistantContent: string, assistantMessageId: string | null) => void;
}

export function MessageList({ messages, streaming, onSaveExample }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [feedbackById, setFeedbackById] = useState<Record<string, -1 | 1>>({});

  useEffect(() => {
    const el = containerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streaming?.content]);

  const sendFeedback = async (messageId: string, rating: -1 | 1) => {
    setFeedbackById((m) => ({ ...m, [messageId]: rating }));
    try {
      await api.sendFeedback(messageId, rating);
    } catch {
      setFeedbackById((m) => {
        const next = { ...m };
        delete next[messageId];
        return next;
      });
    }
  };

  return (
    <div className="messages" ref={containerRef}>
      <div className="inner">
        {messages.map((m, idx) => {
          const previous = messages[idx - 1];
          const showSaveExample = m.role === "assistant" && previous?.role === "user";
          return (
            <div key={m.id} className={`message ${m.role}`}>
              <div className="meta">
                <span>{m.role}</span>
                <span>{new Date(m.createdAt).toLocaleTimeString()}</span>
              </div>
              <div>{m.content}</div>
              {m.role === "assistant" && (
                <div className="feedback">
                  <button
                    className={feedbackById[m.id] === 1 ? "active" : ""}
                    onClick={() => sendFeedback(m.id, 1)}
                    aria-label="Thumbs up"
                  >
                    👍
                  </button>
                  <button
                    className={feedbackById[m.id] === -1 ? "active" : ""}
                    onClick={() => sendFeedback(m.id, -1)}
                    aria-label="Thumbs down"
                  >
                    👎
                  </button>
                  {showSaveExample && onSaveExample && previous && (
                    <button onClick={() => onSaveExample(previous, m.content, m.id)}>Save as example</button>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {streaming?.isStreaming && (
          <div className="message assistant">
            <div className="meta">
              <span>assistant</span>
              <span>streaming…</span>
            </div>
            <div>{streaming.content || "…"}</div>
          </div>
        )}
      </div>
    </div>
  );
}
