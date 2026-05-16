import { useEffect, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { ThreadSidebar } from "@/components/ThreadSidebar";
import {
  PersonalizationDialog,
  type PersonalizationDialogMode,
} from "@/components/PersonalizationDialog";
import { api } from "@/api/client";
import {
  personalizeGateKey,
  personalizeSkipKey,
} from "@/lib/personalizationSession";

type PersonalizeState =
  | { open: false }
  | { open: true; mode: PersonalizationDialogMode };

export default function AppLayout() {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [personalize, setPersonalize] = useState<PersonalizeState>({ open: false });

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate("/login", { replace: true });
      } else {
        setSession(session);
      }
      setReady(true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (!session) navigate("/login", { replace: true });
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const userId = session?.user?.id ?? "";

  useEffect(() => {
    if (!userId) return;

    const gate = personalizeGateKey(userId);
    const skip = personalizeSkipKey(userId);

    if (sessionStorage.getItem(gate) === "done") return;
    if (sessionStorage.getItem(gate) === "pending") return;

    if (sessionStorage.getItem(skip)) {
      sessionStorage.setItem(gate, "done");
      return;
    }

    sessionStorage.setItem(gate, "pending");
    let cancelled = false;

    api
      .getPreferences()
      .then((res) => {
        if (cancelled) return;
        sessionStorage.setItem(gate, "done");
        if (res.onboardingCompleted) return;
        if (sessionStorage.getItem(skip)) return;
        setPersonalize({ open: true, mode: "onboarding" });
      })
      .catch(() => {
        if (!cancelled) sessionStorage.setItem(gate, "done");
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (!ready || !session) {
    return (
      <div className="grid h-screen place-items-center bg-[var(--gradient-horizon)] text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      <ThreadSidebar
        email={session.user.email ?? null}
        userId={userId}
        onOpenProfileSettings={() => setPersonalize({ open: true, mode: "settings" })}
      />
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>

      {personalize.open && (
        <PersonalizationDialog
          open={personalize.open}
          mode={personalize.mode}
          userId={userId}
          onClose={() => setPersonalize({ open: false })}
        />
      )}
    </div>
  );
}
