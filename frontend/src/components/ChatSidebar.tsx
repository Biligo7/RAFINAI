import { useState } from "react";
import type { Chat } from "../types/api.js";

interface Props {
  chats: Chat[];
  activeChatId: string | null;
  onSelect: (chatId: string) => void;
  onNew: () => void;
  onRename: (chatId: string, title: string) => void;
  onDelete: (chatId: string) => void;
  appName: string;
}

export function ChatSidebar({ chats, activeChatId, onSelect, onNew, onRename, onDelete, appName }: Props) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");

  return (
    <aside className="sidebar">
      <header>
        <span>{appName}</span>
      </header>
      <button className="new-chat" onClick={onNew}>
        + New chat
      </button>
      <ul>
        {chats.map((chat) => (
          <li
            key={chat.id}
            className={chat.id === activeChatId ? "active" : ""}
            onClick={() => onSelect(chat.id)}
          >
            {renamingId === chat.id ? (
              <input
                autoFocus
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onBlur={() => {
                  if (draftTitle.trim() && draftTitle !== chat.title) onRename(chat.id, draftTitle.trim());
                  setRenamingId(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  if (e.key === "Escape") setRenamingId(null);
                }}
              />
            ) : (
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {chat.title}
              </span>
            )}
            <button
              title="Rename"
              onClick={(e) => {
                e.stopPropagation();
                setRenamingId(chat.id);
                setDraftTitle(chat.title);
              }}
            >
              ✎
            </button>
            <button
              title="Delete"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(chat.id);
              }}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <footer>
        Cheap-by-default Azure AI Chat. See README for production hardening.
      </footer>
    </aside>
  );
}
