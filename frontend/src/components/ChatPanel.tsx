import { FormEvent, ReactNode, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  api,
  streamChatMessage,
  type ImageAttachment,
  type Message,
} from "@/api/client";
import {
  ASSISTANT_GREETING,
  TRAIL_CARD_MARKER,
  getTrailById,
  mockAssistantReply,
  parseTrailIdsFromAssistantText,
} from "@/lib/trails";
import { ItineraryCard } from "@/components/ItineraryCard";
import {
  ArrowUp,
  Camera,
  Compass,
  Sparkles,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const QUICK_STARTS = [
  "Find a beginner mountain trail",
  "Suggest a coastal hidden gem",
  "Check safety for Mt. Olympus",
];

const PHOTO_DEFAULT_PROMPT =
  "Find a Greek trail similar to the terrain in this photo.";
const MAX_IMAGE_EDGE = 1400;
const MAX_IMAGE_DATA_URL_LENGTH = 6_200_000;
const THUMBNAIL_EDGE = 360;
const TEXTAREA_MAX_HEIGHT = 160;
const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type PendingPhoto = ImageAttachment & {
  previewUrl: string;
};

type MessageImagePreview = {
  name?: string;
  thumbnailDataUrl?: string;
  dataUrl?: string;
};

function hasDraggedFiles(e: React.DragEvent) {
  return Array.from(e.dataTransfer.types).includes("Files");
}

function isOfflineOnlyError(err: unknown): boolean {
  const m = err instanceof Error ? err.message : String(err);
  return (
    m.includes("Failed to fetch") ||
    m.includes("NetworkError") ||
    m.includes("Load failed") ||
    m.includes("ECONNREFUSED") ||
    m.toLowerCase().includes("network")
  );
}

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
  const [attachedPhoto, setAttachedPhoto] = useState<PendingPhoto | null>(null);
  const [isPhotoDragActive, setIsPhotoDragActive] = useState(false);
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
    const textarea = inputRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    const nextHeight = Math.min(textarea.scrollHeight, TEXTAREA_MAX_HEIGHT);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY =
      textarea.scrollHeight > TEXTAREA_MAX_HEIGHT ? "auto" : "hidden";
  }, [input, attachedPhoto]);

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
    mutationFn: async ({
      text,
      photo,
    }: {
      text: string;
      photo: PendingPhoto | null;
    }) => {
      if (messages.length === 0) {
        const shortTitle = text.slice(0, 48) + (text.length > 48 ? "…" : "");
        await api.renameChat(threadId, shortTitle);
        qc.invalidateQueries({ queryKey: ["threads"] });
      }

      setStreamingText("");
      const images = photo
        ? [
            {
              name: photo.name,
              mediaType: photo.mediaType,
              dataUrl: photo.dataUrl,
              thumbnailDataUrl: photo.thumbnailDataUrl,
            },
          ]
        : [];

      try {
        const full = await streamChatMessage(threadId, text, {
          onOpen: () => {
            qc.invalidateQueries({ queryKey: ["messages", threadId] });
          },
          onToken: (delta) => {
            setStreamingText((prev) => prev + delta);
          },
        }, images);

        onAssistantTrails(parseTrailIdsFromAssistantText(full));
      } catch (streamErr) {
        if (!isOfflineOnlyError(streamErr)) {
          throw streamErr;
        }
        toast.warning("Cannot reach the AI backend — using offline demo replies.");
        const msgs = await api.listMessages(threadId);
        const displayText = text;
        const alreadySent = msgs.some((m) => m.role === "user" && m.content === displayText);
        if (!alreadySent) {
          await api.saveMessage(threadId, "user", displayText);
        }
        const reply = mockAssistantReply(text);
        onAssistantTrails(reply.trailIds);
        setStreamingText("");
        const chunks = reply.text.split(/(\s+)/);
        for (const part of chunks) {
          await new Promise((r) => setTimeout(r, 12));
          setStreamingText((prev) => prev + part);
        }
        await api.saveMessage(threadId, "assistant", reply.text);
      }

      qc.invalidateQueries({ queryKey: ["messages", threadId] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Chat request failed");
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["messages", threadId] });
      setPending(false);
      setStreamingText("");
      setTimeout(() => inputRef.current?.focus(), 0);
    },
  });

  const submitText = (text: string, photoOverride?: PendingPhoto | null) => {
    const photo = photoOverride === undefined ? attachedPhoto : photoOverride;
    const trimmed = text.trim();
    const finalText = trimmed || (photo ? PHOTO_DEFAULT_PROMPT : "");
    if (!finalText || pending) return;
    setInput("");
    setAttachedPhoto(null);
    setPending(true);
    send.mutate({ text: finalText, photo });
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    submitText(input);
  };

  const attachPhotoFile = async (file: File) => {
    try {
      const photo = await prepareImageAttachment(file);
      setAttachedPhoto(photo);
      inputRef.current?.focus();
      toast.success(`Attached "${file.name}"`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not attach photo");
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await attachPhotoFile(file);
    } finally {
      e.target.value = "";
    }
  };

  const handleComposerDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    if (pending || !hasDraggedFiles(e)) return;
    e.preventDefault();
    e.stopPropagation();
    setIsPhotoDragActive(true);
  };

  const handleComposerDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (pending || !hasDraggedFiles(e)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
    setIsPhotoDragActive(true);
  };

  const handleComposerDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setIsPhotoDragActive(false);
  };

  const handleComposerDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    if (pending) return;
    e.preventDefault();
    e.stopPropagation();
    setIsPhotoDragActive(false);
    const file = Array.from(e.dataTransfer.files).find((item) =>
      item.type.startsWith("image/"),
    );
    if (!file) {
      toast.error("Drop a JPG, PNG, or WebP image.");
      return;
    }
    await attachPhotoFile(file);
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
                metadata={m.metadata}
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
          {attachedPhoto && (
            <div className="mx-auto mb-2 flex max-w-2xl items-center gap-3 rounded-xl border border-border bg-background px-3 py-2 shadow-[var(--shadow-soft)]">
              <img
                src={attachedPhoto.previewUrl}
                alt=""
                className="h-14 w-14 shrink-0 rounded-lg object-cover"
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-foreground">
                  {attachedPhoto.name}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAttachedPhoto(null)}
                disabled={pending}
                className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
                aria-label="Remove photo"
                title="Remove photo"
              >
                <X className="size-4" />
              </button>
            </div>
          )}
          <div
            onDragEnter={handleComposerDragEnter}
            onDragOver={handleComposerDragOver}
            onDragLeave={handleComposerDragLeave}
            onDrop={handleComposerDrop}
            className={cn(
              "mx-auto flex max-w-2xl items-end gap-2 rounded-2xl border border-border bg-background px-3 py-2.5 shadow-[var(--shadow-soft)] transition focus-within:ring-2 focus-within:ring-primary/40",
              isPhotoDragActive && "border-primary bg-primary/5 ring-2 ring-primary/30",
            )}
          >
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
              placeholder={
                attachedPhoto
                  ? "Find a similar Greek trail..."
                  : "Ask for quiet Greek trails or alternatives..."
              }
              className="max-h-40 flex-1 resize-none overflow-y-hidden bg-transparent py-1.5 text-sm leading-relaxed outline-none placeholder:text-[13px] placeholder:text-muted-foreground"
            />
            <button
              type="submit"
              disabled={pending || (!input.trim() && !attachedPhoto)}
              className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Send"
            >
              <ArrowUp className="size-4" />
            </button>
          </div>
          <p className="mx-auto mt-2 max-w-2xl text-[11px] text-muted-foreground">
            Local Host helps redirect trips from overrun icons to authentic
            Greek local experiences. Suggestions are illustrative.
          </p>
        </form>
      </div>
    </div>
  );
}

async function prepareImageAttachment(file: File): Promise<PendingPhoto> {
  if (!SUPPORTED_IMAGE_TYPES.has(file.type)) {
    throw new Error("Please upload a JPG, PNG, or WebP image.");
  }

  const source = await readFileAsDataUrl(file);
  const image = await loadImage(source);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (!width || !height) {
    throw new Error("Could not read that image.");
  }

  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(width, height));
  const shouldResize =
    scale < 1 ||
    source.length > MAX_IMAGE_DATA_URL_LENGTH ||
    file.type === "image/png";

  const dataUrl = shouldResize
    ? resizeImageToJpeg(
        image,
        Math.round(width * scale),
        Math.round(height * scale),
      )
    : source;

  if (dataUrl.length > MAX_IMAGE_DATA_URL_LENGTH) {
    throw new Error("Please choose a smaller photo.");
  }

  const thumbnailScale = Math.min(1, THUMBNAIL_EDGE / Math.max(width, height));
  const thumbnailDataUrl = resizeImageToJpeg(
    image,
    Math.round(width * thumbnailScale),
    Math.round(height * thumbnailScale),
    0.76,
  );

  return {
    name: file.name,
    mediaType: dataUrl.startsWith("data:image/webp") ? "image/webp" : "image/jpeg",
    dataUrl,
    thumbnailDataUrl,
    previewUrl: thumbnailDataUrl,
  };
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Could not read that image."));
    };
    reader.onerror = () => reject(new Error("Could not read that image."));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load that image."));
    image.src = src;
  });
}

function resizeImageToJpeg(
  image: HTMLImageElement,
  width: number,
  height: number,
  quality = 0.82,
): string {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not prepare that image.");
  ctx.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", quality);
}

function MessageBubble({
  role,
  content,
  metadata,
  streaming,
  onPinTrail,
}: {
  role: "user" | "assistant";
  content: string;
  metadata?: Record<string, unknown> | null;
  streaming?: boolean;
  onPinTrail?: (id: string) => void;
}) {
  const isUser = role === "user";
  const imagePreviews = isUser ? getMessageImagePreviews(metadata) : [];
  const match = !isUser ? content.match(TRAIL_CARD_MARKER) : null;
  const trailIds = match
    ? match[1]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  const cleaned = match
    ? content.replace(TRAIL_CARD_MARKER, "").replace(/\n{3,}/g, "\n\n").trim()
    : content.replace(/\n{0,2}\[Photo attached:[^\]]+\]\s*$/i, "").trim();
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
        {imagePreviews.length > 0 && (
          <div className="flex max-w-full flex-wrap justify-end gap-2">
            {imagePreviews.map((image, index) => {
              const src = image.thumbnailDataUrl || image.dataUrl;
              if (!src) return null;
              return (
                <img
                  key={`${image.name ?? "image"}-${index}`}
                  src={src}
                  alt={image.name ?? "Uploaded image"}
                  className="max-h-36 max-w-48 rounded-xl border border-primary-foreground/25 object-cover shadow-[var(--shadow-soft)]"
                />
              );
            })}
          </div>
        )}
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
  const lines = text.split("\n");
  const nodes: ReactNode[] = [];
  lines.forEach((line, index) => {
    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+)$/);
    if (heading) {
      nodes.push(
        <div
          key={`h-${index}`}
          className={cn(
            index > 0 && "mt-3",
            heading[1].length <= 2
              ? "text-base font-semibold text-foreground"
              : "text-sm font-semibold text-foreground",
          )}
        >
          {renderInlineMarkdown(heading[2])}
        </div>,
      );
      return;
    }

    if (!line.trim()) {
      nodes.push(<br key={`br-${index}`} />);
      return;
    }

    nodes.push(
      <span key={`line-${index}`}>
        {renderInlineMarkdown(line)}
        {index < lines.length - 1 ? "\n" : null}
      </span>,
    );
  });
  return <>{nodes}</>;
}

function getMessageImagePreviews(
  metadata?: Record<string, unknown> | null,
): MessageImagePreview[] {
  const images = metadata?.images;
  if (!Array.isArray(images)) return [];
  return images.filter(isMessageImagePreview);
}

function isMessageImagePreview(value: unknown): value is MessageImagePreview {
  if (!value || typeof value !== "object") return false;
  const image = value as Record<string, unknown>;
  return (
    (typeof image.thumbnailDataUrl === "string" ||
      typeof image.dataUrl === "string") &&
    (image.name === undefined || typeof image.name === "string")
  );
}

function renderInlineMarkdown(text: string) {
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
