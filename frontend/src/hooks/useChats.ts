import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client.js";
import type { Chat } from "../types/api.js";

export function useChats() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setChats(await api.listChats());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load chats");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const create = useCallback(
    async (title: string) => {
      const chat = await api.createChat(title);
      setChats((cs) => [chat, ...cs]);
      return chat;
    },
    [],
  );

  const rename = useCallback(async (id: string, title: string) => {
    const chat = await api.renameChat(id, title);
    setChats((cs) => cs.map((c) => (c.id === id ? chat : c)));
  }, []);

  const remove = useCallback(async (id: string) => {
    await api.deleteChat(id);
    setChats((cs) => cs.filter((c) => c.id !== id));
  }, []);

  return { chats, loading, error, refresh, create, rename, remove };
}
