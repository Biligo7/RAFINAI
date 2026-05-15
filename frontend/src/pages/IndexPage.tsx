import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { api } from "@/api/client";

export default function IndexPage() {
  const navigate = useNavigate();
  const [msg, setMsg] = useState("Charting your route…");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const chats = await api.listChats();
        if (cancelled) return;
        if (chats.length > 0) {
          navigate(`/chat/${chats[0].id}`, { replace: true });
        } else {
          const chat = await api.createChat("New Trail Chat");
          if (!cancelled) navigate(`/chat/${chat.id}`, { replace: true });
        }
      } catch (err) {
        if (!cancelled) {
          setMsg(err instanceof Error ? err.message : "Failed to load chats");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="grid h-screen place-items-center bg-[var(--gradient-horizon)] text-muted-foreground">
      <p className="text-sm">{msg}</p>
    </div>
  );
}
