import { useNavigate, useParams, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Chat } from "@/api/client";
import { supabase } from "@/integrations/supabase/client";
import { LocalHostLogo } from "./LocalHostLogo";
import { LogOut, Plus, Settings2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

import { clearPersonalizationSessionKeys } from "@/lib/personalizationSession";

export function ThreadSidebar({
  email,
  userId,
  onOpenProfileSettings,
}: {
  email: string | null;
  userId: string;
  onOpenProfileSettings: () => void;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { threadId: activeId } = useParams<{ threadId: string }>();

  const { data: chats = [] } = useQuery({
    queryKey: ["threads"],
    queryFn: () => api.listChats(),
  });

  const create = useMutation({
    mutationFn: () => api.createChat("New Trail Chat"),
    onSuccess: (chat: Chat) => {
      qc.invalidateQueries({ queryKey: ["threads"] });
      navigate(`/chat/${chat.id}`);
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteChat(id),
    onSuccess: (_: void, id: string) => {
      qc.invalidateQueries({ queryKey: ["threads"] });
      if (id === activeId) navigate("/");
    },
  });

  const signOut = async () => {
    if (userId) clearPersonalizationSessionKeys(userId);
    await supabase.auth.signOut();
    qc.clear();
    navigate("/login");
  };

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground">
      {/* Brand */}
      <div className="flex items-center gap-2.5 border-b border-sidebar-border px-4 py-4">
        <LocalHostLogo className="h-8 w-8" />
        <div>
          <div className="text-sm font-semibold tracking-tight">Local Host</div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-sidebar-foreground/60">
            Authentic Greek Experience
          </div>
        </div>
      </div>

      {/* New */}
      <div className="px-3 pt-3">
        <button
          onClick={() => create.mutate()}
          disabled={create.isPending}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-sidebar-primary px-3 py-2 text-sm font-medium text-sidebar-primary-foreground transition hover:opacity-90 disabled:opacity-60"
        >
          <Plus className="size-4" />
          New trail chat
        </button>
      </div>

      {/* Threads */}
      <div className="mt-4 flex-1 overflow-y-auto px-2 pb-2">
        <div className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/50">
          Conversations
        </div>
        <ul className="space-y-0.5">
          {chats.map((t) => {
            const active = t.id === activeId;
            return (
              <li key={t.id} className="group relative">
                <Link
                  to={`/chat/${t.id}`}
                  className={cn(
                    "flex items-center justify-between rounded-md px-2.5 py-2 text-sm transition",
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                  )}
                >
                  <span className="truncate">{t.title}</span>
                </Link>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    remove.mutate(t.id);
                  }}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-sidebar-foreground/40 opacity-0 transition hover:text-destructive group-hover:opacity-100"
                  aria-label="Delete conversation"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Footer */}
      <div className="border-t border-sidebar-border px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-xs text-sidebar-foreground/60">
            {email ?? "Explorer"}
          </span>
          <button
            type="button"
            onClick={onOpenProfileSettings}
            className="shrink-0 rounded p-1 text-sidebar-foreground/60 transition hover:bg-sidebar-accent hover:text-sidebar-foreground"
            aria-label="Travel profile and preferences"
            title="Travel profile"
          >
            <Settings2 className="size-4" />
          </button>
          <button
            onClick={signOut}
            className="shrink-0 rounded p-1 text-sidebar-foreground/60 transition hover:bg-sidebar-accent hover:text-sidebar-foreground"
            aria-label="Sign out"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
