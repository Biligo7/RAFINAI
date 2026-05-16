import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { api } from "@/api/client";
import { Trash2 } from "lucide-react";
import { setPersonalizationSkippedThisSession, clearPersonalizationGate } from "@/lib/personalizationSession";

interface ChatMessage {
  id: number;
  role: "assistant" | "user";
  text: string;
  prefIndex?: number;
}

const ONBOARDING_WELCOME =
  "Welcome to Local Host! To tailor trails and tips for you, it helps to know a bit about you — including your age or age range (for example, how challenging a hike should be, pace, and accessibility). " +
  "You can share your travel style too: what you love, what you avoid, and anything that makes a trip comfortable for you.";

const SUGGESTION_CHIPS = [
  "I'm in my 20s",
  "I'm in my 40s",
  "I'm over 60 — I prefer gentle walks",
  "I'm traveling with young children",
  "I love mountains and hiking",
  "I prefer beaches and swimming",
  "I enjoy local cuisine and tavernas",
  "I travel with my pet",
  "I don't like crowded tourist spots",
  "I prefer relaxed, low-impact days",
];

/** Preset age chips: picking one hides the others until that line is removed. */
const MUTUALLY_EXCLUSIVE_AGE_CHIPS = new Set<string>([
  "I'm in my 20s",
  "I'm in my 40s",
  "I'm over 60 — I prefer gentle walks",
]);

const BOT_RESPONSES = [
  "Thanks — that helps. Anything about your age, fitness level, or pace I should keep in mind?",
  "Noted! What else should I know for planning days out?",
  "Great. Tell me more about your ideal trip or limits.",
  "Perfect. Add anything else that matters for comfort or safety.",
  "Got it — keep going if there is more to share.",
];

function buildOnboardingMessages(prefs: string[]): ChatMessage[] {
  const out: ChatMessage[] = [{ id: 0, role: "assistant", text: ONBOARDING_WELCOME }];
  let id = 1;
  prefs.forEach((text, i) => {
    out.push({ id: id++, role: "user", text, prefIndex: i });
    out.push({
      id: id++,
      role: "assistant",
      text: BOT_RESPONSES[i % BOT_RESPONSES.length],
    });
  });
  return out;
}

export type PersonalizationDialogMode = "onboarding" | "settings";

interface PersonalizationDialogProps {
  open: boolean;
  mode: PersonalizationDialogMode;
  userId: string;
  onClose: () => void;
}

export function PersonalizationDialog({
  open,
  mode,
  userId,
  onClose,
}: PersonalizationDialogProps) {
  const [input, setInput] = useState("");
  const [preferences, setPreferences] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const savedRef = useRef(false);

  const onboardingMessages = useMemo(
    () => buildOnboardingMessages(preferences),
    [preferences],
  );

  const resetOnboardingUi = useCallback(() => {
    savedRef.current = false;
    setPreferences([]);
    setInput("");
    setLoadError(null);
    setSettingsLoaded(false);
  }, []);

  useEffect(() => {
    if (!open) return;

    if (mode === "onboarding") {
      resetOnboardingUi();
      return;
    }

    // settings: load existing
    setLoadError(null);
    setSettingsLoaded(false);
    setInput("");
    savedRef.current = false;
    void api
      .getPreferences()
      .then((res) => {
        const lines = res.preferences?.filter(Boolean) ?? [];
        setPreferences(lines);
        setSettingsLoaded(true);
      })
      .catch(() => {
        setLoadError("Could not load your profile. Try again.");
        setSettingsLoaded(true);
      });
  }, [open, mode, resetOnboardingUi]);

  useEffect(() => {
    if (mode !== "onboarding" || !scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [onboardingMessages, mode]);

  const addPreference = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || preferences.includes(trimmed)) return;
    setPreferences((prev) => [...prev, trimmed]);
    setInput("");
    inputRef.current?.focus();
  };

  const removeAt = (index: number) => {
    setPreferences((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    addPreference(input);
  };

  const handleSave = async () => {
    if (mode === "onboarding" && preferences.length === 0) return;
    setSaving(true);
    setLoadError(null);
    try {
      await api.savePreferences(preferences);
      savedRef.current = true;
      if (mode === "settings" && preferences.length === 0) {
        clearPersonalizationGate(userId);
      }
      onClose();
    } catch {
      setLoadError("Save failed. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const dismissOnboardingWithoutSave = () => {
    if (mode === "onboarding" && !savedRef.current) {
      setPersonalizationSkippedThisSession(userId);
    }
    onClose();
  };

  const handleSkip = () => {
    dismissOnboardingWithoutSave();
  };

  const onDialogOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      if (savedRef.current) {
        onClose();
        return;
      }
      if (mode === "onboarding") dismissOnboardingWithoutSave();
      else onClose();
    }
  };

  const selectedPresetAge = useMemo(
    () => preferences.find((p) => MUTUALLY_EXCLUSIVE_AGE_CHIPS.has(p)),
    [preferences],
  );

  const availableChips = useMemo(
    () =>
      SUGGESTION_CHIPS.filter((c) => {
        if (preferences.includes(c)) return false;
        if (
          selectedPresetAge &&
          MUTUALLY_EXCLUSIVE_AGE_CHIPS.has(c) &&
          c !== selectedPresetAge
        ) {
          return false;
        }
        return true;
      }),
    [preferences, selectedPresetAge],
  );

  const title =
    mode === "onboarding" ? "Personalize your experience" : "Your travel profile";
  const description =
    mode === "onboarding"
      ? "Share preferences (including age or pace) so recommendations fit you."
      : "Remove lines you do not want the assistant to use, add new ones, then save.";

  return (
    <Dialog open={open} onOpenChange={onDialogOpenChange}>
      <DialogContent className="flex h-[min(85vh,640px)] max-w-lg flex-col gap-0 p-0 sm:rounded-2xl">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle className="text-lg">{title}</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {description}
          </DialogDescription>
        </DialogHeader>

        {loadError && (
          <div className="border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-center text-sm text-destructive">
            {loadError}
          </div>
        )}

        {mode === "settings" && settingsLoaded && (
          <div className="max-h-40 overflow-y-auto border-b px-4 py-3">
            <div className="mb-2 text-xs font-medium text-muted-foreground">
              Saved preferences
            </div>
            {preferences.length === 0 ? (
              <p className="text-sm text-muted-foreground">No lines yet — add below.</p>
            ) : (
              <ul className="space-y-2">
                {preferences.map((line, i) => (
                  <li
                    key={`${line}-${i}`}
                    className="flex items-start gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 flex-1 break-words">{line}</span>
                    <button
                      type="button"
                      onClick={() => removeAt(i)}
                      className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                      aria-label="Remove preference"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {mode === "onboarding" && (
          <div className="flex-1 overflow-y-auto px-4 py-4" ref={scrollRef}>
            <div className="space-y-3">
              {onboardingMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    "flex items-start gap-2",
                    msg.role === "user" ? "justify-end" : "justify-start",
                  )}
                >
                  {msg.role === "user" && msg.prefIndex !== undefined && (
                    <button
                      type="button"
                      onClick={() => removeAt(msg.prefIndex!)}
                      className="mt-1 shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                      aria-label="Remove this preference"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                  <div
                    className={cn(
                      "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground",
                    )}
                  >
                    {msg.text}
                  </div>
                </div>
              ))}
            </div>

            {availableChips.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {availableChips.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => addPreference(chip)}
                    className="rounded-full border border-border bg-card px-3 py-1.5 text-xs text-foreground transition hover:border-primary hover:bg-primary/5"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {mode === "settings" && settingsLoaded && (
          <div className="flex-1 overflow-y-auto px-4 py-4">
            {availableChips.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {availableChips.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => addPreference(chip)}
                    className="rounded-full border border-border bg-card px-3 py-1.5 text-xs text-foreground transition hover:border-primary hover:bg-primary/5"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="border-t px-4 py-3">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                mode === "onboarding"
                  ? "e.g. I'm 35 and prefer half-day hikes…"
                  : "Add a new preference…"
              }
              className="flex-1 rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none ring-primary/40 transition placeholder:text-muted-foreground focus:border-primary focus:ring-2"
            />
            <Button type="submit" size="sm" disabled={!input.trim()}>
              Add
            </Button>
          </form>

          <div className="mt-3 flex items-center justify-between gap-2">
            {mode === "onboarding" ? (
              <button
                type="button"
                onClick={handleSkip}
                className="text-xs text-muted-foreground transition hover:text-foreground"
              >
                Skip for now
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onClose()}
                className="text-xs text-muted-foreground transition hover:text-foreground"
              >
                Cancel
              </button>
            )}
            <Button
              onClick={handleSave}
              disabled={
                saving ||
                (mode === "settings" && !settingsLoaded) ||
                (mode === "onboarding" && preferences.length === 0)
              }
              size="sm"
            >
              {saving
                ? "Saving…"
                : mode === "settings"
                  ? preferences.length === 0
                    ? "Clear profile"
                    : `Save (${preferences.length})`
                  : `Save & continue (${preferences.length})`}
            </Button>
          </div>
          {mode === "settings" && preferences.length === 0 && (
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Saving with no lines clears your profile; the welcome prompt will show again next
              login.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
