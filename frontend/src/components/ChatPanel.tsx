import { FormEvent, ReactNode, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Message } from "@/api/client";
import {
  mockAssistantReply,
  ASSISTANT_GREETING,
  TRAIL_CARD_MARKER,
  getTrailById,
} from "@/lib/trails";
import { ItineraryCard } from "@/components/ItineraryCard";
import {
  ArrowUp,
  Camera,
  Compass,
  Sparkles,
  Database,
  Cloud,
  Mountain,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const REASONING_STEPS = [
  { icon: Database, label: "Searching Greek Trail Database…" },
  { icon: Cloud, label: "Checking Weather via OpenWeatherMap…" },
  { icon: Mountain, label: "Cross-referencing elevation & trail conditions…" },
  { icon: Sparkles, label: "Curating hidden-gem matches…" },
];

const QUICK_STARTS = [
  "Find a beginner mountain trail",
  "Suggest a coastal hidden gem",
  "Check safety for Mt. Olympus",
];

type Injection = { text: string; trailIds: string[]; nonce: number } | null;

export function ChatPanel({
  threadId,
  onAssistantTrails,
  onPinTrail,
  injection,
  onInjectionConsumed,
}: {
  threadId: string;
  onAssistantTrails: (ids: string[]) => void;
  onPinTrail: (id: string) => void;
  injection?: Injection;
  onInjectionConsumed?: () => void;
}) {
  const qc = useQueryClient();
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [reasoningStep, setReasoningStep] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: messages = [] } = useQuery({
    queryKey: ["messages", threadId],
    queryFn: () => api.listMessages(threadId),
  });

  useEffect(() => {
    inputRef.current?.focus();
  }, [threadId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, pending, streamingText]);

  useEffect(() => {
    if (!pending) return;
    setReasoningStep(0);
    const id = setInterval(() => {
      setReasoningStep((s) => (s + 1) % REASONING_STEPS.length);
    }, 1100);
    return () => clearInterval(id);
  }, [pending]);

  // Externally-triggered assistant message (e.g. "Re-route for Rain")
  useEffect(() => {
    if (!injection) return;
    let cancelled = false;
    (async () => {
      onAssistantTrails(injection.trailIds);
      await api.saveMessage(threadId, "assistant", injection.text);
      if (!cancelled) {
        qc.invalidateQueries({ queryKey: ["messages", threadId] });
        onInjectionConsumed?.();
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [injection?.nonce]);

  const send = useMutation({
    mutationFn: async (text: string) => {
      await api.saveMessage(threadId, "user", text);

      if (messages.length === 0) {
        const shortTitle = text.slice(0, 48) + (text.length > 48 ? "…" : "");
        await api.renameChat(threadId, shortTitle);
        qc.invalidateQueries({ queryKey: ["threads"] });
      }

      qc.invalidateQueries({ queryKey: ["messages", threadId] });

      await new Promise((r) => setTimeout(r, 1400));
      const reply = mockAssistantReply(text);
      onAssistantTrails(reply.trailIds);

      setStreamingText("");
      const tokens = reply.text.split(/(\s+)/);
      for (const tok of tokens) {
        await new Promise((r) => setTimeout(r, 18));
        setStreamingText((prev) => prev + tok);
      }

      await api.saveMessage(threadId, "assistant", reply.text);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["messages", threadId] });
      setPending(false);
      setStreamingText("");
      setTimeout(() => inputRef.current?.focus(), 0);
    },
  });

  const submitText = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || pending) return;
    setInput("");
    setPending(true);
    send.mutate(trimmed);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    submitText(input);
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    toast.success(`Analyzing "${file.name}"…`, {
      description:
        "Photo-to-Trail will match this landscape to a hidden Greek route.",
    });
    submitText(
      `I uploaded a landscape photo (${file.name}). Find a Greek trail with similar terrain.`,
    );
    e.target.value = "";
  };

  const showGreeting = messages.length === 0 && !pending;

  return (
    <div className="flex h-full flex-col bg-[var(--gradient-horizon)]">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6">
        {showGreeting ? (
          <Greeting
            onSuggest={(t) => {
              setInput(t);
              inputRef.current?.focus();
            }}
          />
        ) : (
          <div className="mx-auto flex max-w-2xl flex-col gap-5">
            {messages.map((m) => (
              <MessageBubble
                key={m.id}
                role={m.role as "user" | "assistant"}
                content={m.content}
                onPinTrail={onPinTrail}
              />
            ))}
            {pending && streamingText && (
              <MessageBubble
                role="assistant"
                content={streamingText}
                streaming
                onPinTrail={onPinTrail}
              />
            )}
          </div>
        )}
      </div>

      <div className="border-t border-border bg-card/80 backdrop-blur">
        <div
          className={cn(
            "overflow-hidden transition-all duration-300",
            pending ? "max-h-12 opacity-100" : "max-h-0 opacity-0",
          )}
        >
          <ReasoningBar step={reasoningStep} />
        </div>

        {messages.length === 0 && !pending && (
          <div className="mx-auto flex max-w-2xl flex-wrap gap-2 px-6 pt-4">
            {QUICK_STARTS.map((q) => (
              <button
                key={q}
                onClick={() => submitText(q)}
                className="rounded-full border border-border bg-background px-3.5 py-1.5 text-xs font-medium text-foreground transition hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
              >
                {q}
              </button>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} className="px-6 py-4">
          <div className="mx-auto flex max-w-2xl items-end gap-2 rounded-2xl border border-border bg-background px-3 py-2.5 shadow-[var(--shadow-soft)] focus-within:ring-2 focus-within:ring-primary/40">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={pending}
              className="grid size-9 shrink-0 place-items-center rounded-xl text-[var(--olive)] transition hover:bg-[var(--sand)] hover:text-primary disabled:opacity-40"
              aria-label="Upload landscape photo"
              title="Upload landscape · Photo-to-Trail"
            >
              <Camera className="size-4" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePhotoUpload}
            />
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e as unknown as FormEvent);
                }
              }}
              rows={1}
              placeholder="Ask for a hidden-gem trail near Crete, an alternative to Santorini…"
              className="max-h-40 flex-1 resize-none bg-transparent py-1.5 text-sm leading-relaxed outline-none placeholder:text-muted-foreground"
            />
            <button
              type="submit"
              disabled={pending || !input.trim()}
              className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Send"
            >
              <ArrowUp className="size-4" />
            </button>
          </div>
          <p className="mx-auto mt-2 max-w-2xl text-[11px] text-muted-foreground">
            Pathfinder redirects flows from overrun icons to 300+ Greek mountain
            trails. Suggestions are illustrative.
          </p>
        </form>
      </div>
    </div>
  );
}

function ReasoningBar({ step }: { step: number }) {
  const { icon: Icon, label } = REASONING_STEPS[step];
  return (
    <div className="mx-auto flex max-w-2xl items-center gap-2.5 px-6 pb-1 pt-3">
      <div className="relative grid size-6 place-items-center rounded-full bg-primary/10">
        <Icon className="size-3 text-primary" />
        <span className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
      </div>
      <div key={step} className="flex flex-1 items-center gap-2 animate-fade-in">
        <span className="text-xs font-medium text-foreground">{label}</span>
        <Loader2 className="size-3 animate-spin text-muted-foreground" />
      </div>
      <div className="h-1 w-20 overflow-hidden rounded-full bg-border">
        <div
          className="h-full rounded-full bg-[var(--gradient-aegean)] transition-all duration-500"
          style={{
            width: `${((step + 1) / REASONING_STEPS.length) * 100}%`,
          }}
        />
      </div>
    </div>
  );
}

function MessageBubble({
  role,
  content,
  streaming,
  onPinTrail,
}: {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
  onPinTrail?: (id: string) => void;
}) {
  const isUser = role === "user";
  const match = !isUser ? content.match(TRAIL_CARD_MARKER) : null;
  const trailIds = match
    ? match[1]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  const cleaned = match
    ? content.replace(TRAIL_CARD_MARKER, "").replace(/\n{3,}/g, "\n\n").trim()
    : content;
  const trails = trailIds
    .map((id) => getTrailById(id))
    .filter(Boolean);

  return (
    <div
      className={cn(
        "flex w-full animate-fade-in",
        isUser ? "justify-end" : "justify-start",
      )}
    >
      {!isUser && (
        <div className="mr-3 mt-1 grid size-8 shrink-0 place-items-center rounded-full bg-[var(--gradient-aegean)] text-primary-foreground shadow-[var(--shadow-soft)]">
          <Compass className="size-4" />
        </div>
      )}
      <div
        className={cn(
          "flex max-w-[88%] flex-col gap-3",
          isUser && "items-end",
        )}
      >
        {cleaned && (
          <div
            className={cn(
              "whitespace-pre-wrap text-[14px] leading-relaxed",
              isUser
                ? "rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-primary-foreground shadow-[var(--shadow-soft)]"
                : "rounded-2xl rounded-bl-md border border-border bg-card px-4 py-2.5 text-foreground shadow-[var(--shadow-soft)]",
            )}
          >
            {renderMarkdownLite(cleaned)}
            {streaming && (
              <span className="ml-0.5 inline-block h-4 w-1.5 translate-y-0.5 animate-pulse bg-primary/60" />
            )}
          </div>
        )}
        {trails.length > 0 && !streaming && (
          <div className="flex flex-col gap-2.5">
            {trails.map((t) => (
              <ItineraryCard
                key={t!.id}
                trail={t!}
                onPin={onPinTrail ?? (() => {})}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Greeting({ onSuggest }: { onSuggest: (s: string) => void }) {
  const prompts = [
    "An alternative to Santorini",
    "Quiet gorge hike in Crete",
    "Easy alpine day in the Pindus",
    "Skip Meteora — what's nearby?",
  ];
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-5 pt-12 text-center">
      <div className="grid size-16 place-items-center rounded-2xl bg-[var(--gradient-aegean)] text-primary-foreground shadow-[var(--shadow-elevated)]">
        <Compass className="size-7" />
      </div>
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Where will the path take you?
        </h1>
        <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
          {ASSISTANT_GREETING}
        </p>
      </div>
      <div className="grid w-full grid-cols-2 gap-2 pt-3">
        {prompts.map((p) => (
          <button
            key={p}
            onClick={() => onSuggest(p)}
            className="group flex items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-3 text-left text-sm text-foreground transition hover:border-primary/40 hover:bg-card hover:shadow-[var(--shadow-soft)]"
          >
            <Sparkles className="size-3.5 text-[var(--olive)] transition group-hover:text-primary" />
            <span>{p}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function renderMarkdownLite(text: string) {
  const parts: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|_[^_]+_)/g;
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(re)) {
    if (m.index === undefined) continue;
    if (m.index > last) parts.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**")) {
      parts.push(
        <strong key={i++} className="font-semibold text-foreground">
          {tok.slice(2, -2)}
        </strong>,
      );
    } else {
      parts.push(
        <em key={i++} className="text-muted-foreground">
          {tok.slice(1, -1)}
        </em>,
      );
    }
    last = m.index + tok.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}
