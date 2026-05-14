import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api/client.js";
import type { AppConfigResponse, Chat, Message } from "../types/api.js";
import { useChats } from "../hooks/useChats.js";
import { useStreamingChat } from "../hooks/useStreamingChat.js";
import { ChatSidebar } from "./ChatSidebar.js";
import { MessageList } from "./MessageList.js";
import { MessageComposer } from "./MessageComposer.js";
import { SettingsPanel } from "./SettingsPanel.js";
import { TrainingDataPanel } from "./TrainingDataPanel.js";

// Customize the empty-state suggestions here.
const STARTER_PROMPTS = [
  "Explain Azure Container Apps cold starts in two paragraphs.",
  "Outline a SQL schema for a feedback feature.",
  "Review this snippet of TypeScript and suggest improvements.",
  "Summarise the differences between Azure SQL serverless and provisioned.",
];

export function ChatLayout() {
  const { chats, error: chatsError, create, rename, remove } = useChats();
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [config, setConfig] = useState<AppConfigResponse | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showTraining, setShowTraining] = useState(false);
  const { turn, send } = useStreamingChat();
  // Chats created locally via handleSend skip the next listMessages fetch so
  // the optimistic user message is not clobbered by an empty server response.
  const skipNextFetchRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    void api.getConfig().then(setConfig).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!activeChatId && chats.length > 0) setActiveChatId(chats[0].id);
  }, [chats, activeChatId]);

  useEffect(() => {
    if (!activeChatId) {
      setMessages([]);
      return;
    }
    if (skipNextFetchRef.current.has(activeChatId)) {
      skipNextFetchRef.current.delete(activeChatId);
      return;
    }
    void api.listMessages(activeChatId).then(setMessages);
  }, [activeChatId]);

  // Refresh messages once a stream finishes so the assistant message is
  // persisted with its real id and metadata.
  useEffect(() => {
    if (!activeChatId) return;
    if (turn.isStreaming) return;
    if (turn.assistantMessageId || turn.error) {
      void api.listMessages(activeChatId).then(setMessages);
    }
  }, [turn.isStreaming, turn.assistantMessageId, turn.error, activeChatId]);

  const handleNew = useCallback(async () => {
    const chat = await create("New chat");
    setActiveChatId(chat.id);
    setMessages([]);
  }, [create]);

  const handleSend = useCallback(
    async (content: string) => {
      let chatId = activeChatId;
      let chat: Chat | null = null;
      if (!chatId) {
        chat = await create(content.slice(0, 60));
        chatId = chat.id;
        skipNextFetchRef.current.add(chatId);
        setActiveChatId(chatId);
      }
      // Optimistically render the user's message before the stream begins.
      setMessages((prev) => [
        ...prev,
        {
          id: `optimistic-${Date.now()}`,
          chatId: chatId!,
          role: "user",
          content,
          tokenCount: null,
          provider: null,
          model: null,
          latencyMs: null,
          errorCode: null,
          metadata: null,
          createdAt: new Date().toISOString(),
        },
      ]);
      await send(chatId, content);
    },
    [activeChatId, create, send],
  );

  const handleSaveExample = useCallback(
    async (userMessage: Message, assistantContent: string, assistantMessageId: string | null) => {
      await api.createExample({
        sourceChatId: userMessage.chatId,
        sourceUserMessageId: userMessage.id,
        sourceAssistantMessageId: assistantMessageId,
        inputText: userMessage.content,
        expectedOutputText: assistantContent,
        tags: ["from-chat"],
      });
      setShowTraining(true);
    },
    [],
  );

  const activeChat = chats.find((c) => c.id === activeChatId) ?? null;

  return (
    <div className="app-shell">
      <ChatSidebar
        chats={chats}
        activeChatId={activeChatId}
        appName={config?.appName ?? "Azure AI Chat"}
        onSelect={setActiveChatId}
        onNew={handleNew}
        onRename={rename}
        onDelete={async (id) => {
          await remove(id);
          if (id === activeChatId) setActiveChatId(null);
        }}
      />

      <main className="main">
        <header>
          <h1>{activeChat?.title ?? config?.appName ?? "Azure AI Chat"}</h1>
          <div className="actions">
            <button onClick={() => setShowTraining((v) => !v)}>Training data</button>
            <button onClick={() => setShowSettings((v) => !v)}>Settings</button>
          </div>
        </header>

        {chatsError && <div className="error-banner">{chatsError}</div>}
        {turn.error && <div className="error-banner">Provider error: {turn.error}</div>}

        {!activeChat && messages.length === 0 ? (
          <div className="messages">
            <div className="empty-state">
              <h2>Start a new conversation</h2>
              <p>Using the {config?.aiProvider ?? "mock"} provider.</p>
              <div className="starter-prompts">
                {STARTER_PROMPTS.map((p) => (
                  <button key={p} onClick={() => handleSend(p)}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <MessageList
            messages={messages}
            streaming={turn}
            onSaveExample={handleSaveExample}
          />
        )}

        <MessageComposer disabled={turn.isStreaming} onSend={handleSend} />
      </main>

      {showSettings && <SettingsPanel config={config} onClose={() => setShowSettings(false)} />}
      {showTraining && <TrainingDataPanel onClose={() => setShowTraining(false)} />}
    </div>
  );
}
