import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { LocalHostLogo } from "@/components/LocalHostLogo";
import { toast } from "sonner";

export default function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) navigate("/", { replace: true });
    });
  }, [navigate]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/` },
        });
        if (error) throw error;
        toast.success("Check your inbox to confirm your email.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        navigate("/", { replace: true });
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Authentication failed",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen grid-cols-1 bg-background lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-background p-12 text-foreground lg:flex">
        <div className="flex items-center gap-3">
          <LocalHostLogo className="h-10 w-10" />
          <div>
            <div className="text-lg font-semibold tracking-tight">
              Local Host
            </div>
            <div className="text-[10px] uppercase tracking-[0.2em] opacity-70">
              The authentic Greek local experience
            </div>
          </div>
        </div>
        <div className="space-y-6">
          <h1 className="font-display text-4xl font-semibold leading-tight tracking-tight">
            Travel like a local.
            <br />
            Find Greece beyond the crowds.
          </h1>
          <p className="max-w-md text-base leading-relaxed text-muted-foreground">
            Discover underrated villages, quiet trails, family-run tavernas,
            and island corners that keep your trip personal and local.
          </p>
        </div>
        <div className="text-xs text-muted-foreground">
          The authentic Greek local experience
        </div>
      </div>

      {/* Form */}
      <div className="flex items-center justify-center bg-background p-6 lg:justify-end lg:pr-20 xl:pr-28 2xl:pr-36">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <LocalHostLogo className="h-9 w-9" />
            <span className="text-lg font-semibold text-foreground">
              Local Host
            </span>
          </div>
          <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            {mode === "signin"
              ? "Welcome back, explorer"
              : "Begin your journey"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "signin"
              ? "Pick up your conversations and saved trails."
              : "Create an account to save your routes."}
          </p>

          <form onSubmit={submit} className="mt-6 space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-input bg-card px-3 py-2.5 text-sm text-foreground outline-none ring-primary/40 transition placeholder:text-muted-foreground focus:border-primary focus:ring-2"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Password
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-input bg-card px-3 py-2.5 text-sm text-foreground outline-none ring-primary/40 transition placeholder:text-muted-foreground focus:border-primary focus:ring-2"
                placeholder="********"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="mt-2 w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
            >
              {loading
                ? "..."
                : mode === "signin"
                  ? "Sign in"
                  : "Create account"}
            </button>
          </form>

          <button
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="mt-5 w-full text-center text-sm text-muted-foreground hover:text-foreground"
          >
            {mode === "signin"
              ? "New to Local Host? Create an account"
              : "Already have an account? Sign in"}
          </button>
        </div>
      </div>
    </div>
  );
}
