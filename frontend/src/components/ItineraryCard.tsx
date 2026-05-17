import {
  BookmarkCheck,
  BookmarkPlus,
  Clock,
  Leaf,
  MapPin,
  Mountain,
  ShieldAlert,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Trail } from "@/lib/trails";

const DIFFICULTY_STYLES: Record<Trail["difficulty"], { label: string; cls: string }> = {
  Easy: {
    label: "Beginner",
    cls: "bg-[oklch(0.72_0.16_145)] text-white",
  },
  Moderate: {
    label: "Intermediate",
    cls: "bg-[oklch(0.72_0.17_75)] text-white",
  },
  Strenuous: {
    label: "Expert",
    cls: "bg-[oklch(0.6_0.22_25)] text-white",
  },
};

export function ItineraryCard({
  trail,
  onPin,
  onSave,
  isSaved = false,
}: {
  trail: Trail;
  onPin: (id: string) => void;
  onSave?: (id: string) => void;
  isSaved?: boolean;
}) {
  const diff = DIFFICULTY_STYLES[trail.difficulty];
  const safetyTone = {
    safe: "bg-[oklch(0.95_0.06_145)] text-[oklch(0.38_0.12_145)] border-[oklch(0.85_0.1_145)]",
    caution: "bg-[oklch(0.96_0.09_85)] text-[oklch(0.42_0.14_75)] border-[oklch(0.85_0.13_85)]",
    warning: "bg-[oklch(0.95_0.06_25)] text-[oklch(0.42_0.18_25)] border-[oklch(0.85_0.14_25)]",
  }[trail.safety.status];
  const SafetyIcon = trail.safety.status === "safe"
    ? ShieldCheck
    : trail.safety.status === "caution"
      ? ShieldAlert
      : TriangleAlert;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)] transition hover:shadow-[var(--shadow-elevated)]">
      {/* Header — thumbnail + name */}
      <div className="relative h-32 w-full overflow-hidden bg-[var(--gradient-aegean)]">
        <img
          src={trail.image}
          alt={`${trail.name} landscape`}
          className="h-full w-full object-cover"
          loading="lazy"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-3">
          <div className="min-w-0">
            <div className="truncate text-[15px] font-semibold leading-tight text-white">
              {trail.name}
            </div>
            <div className="mt-0.5 flex items-center gap-1 text-[11px] text-white/85">
              <MapPin className="size-3" />
              <span className="truncate">{trail.region}</span>
            </div>
          </div>
          <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white backdrop-blur">
            Nature-aware
          </span>
        </div>
      </div>

      <div className="space-y-3 p-3.5">
        {/* Stats row */}
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide",
              diff.cls,
            )}
          >
            {diff.label}
          </span>
          <Stat icon={Clock} label={`${trail.durationH}h`} />
          <Stat icon={Mountain} label={`+${trail.elevationM}m`} />
          <span className="ml-auto text-[11px] text-muted-foreground">
            {trail.lengthKm} km
          </span>
        </div>

        {/* Sustainability */}
        <div className="flex items-start gap-2 rounded-xl border border-[oklch(0.88_0.06_125)] bg-[oklch(0.97_0.04_125)] px-3 py-2">
          <div className="grid size-7 shrink-0 place-items-center rounded-full bg-[var(--olive)] text-white">
            <Leaf className="size-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-1.5">
              <span className="text-[12px] font-semibold text-[oklch(0.36_0.09_125)]">
                Sustainability
              </span>
              <span className="text-[13px] font-bold text-[var(--olive)]">
                {trail.sustainability.toFixed(1)}/10
              </span>
            </div>
            <p className="text-[11px] leading-snug text-[oklch(0.42_0.06_125)]">
              {trail.sustainabilityNote}
            </p>
          </div>
        </div>

        {/* Safety alert */}
        <div
          className={cn(
            "flex items-center gap-2 rounded-xl border px-3 py-2 text-[12px] font-medium",
            safetyTone,
          )}
        >
          <span className="relative flex size-2 shrink-0">
            <span
              className={cn(
                "absolute inline-flex h-full w-full animate-ping rounded-full opacity-60",
                trail.safety.status === "safe" && "bg-[oklch(0.6_0.18_145)]",
                trail.safety.status === "caution" && "bg-[oklch(0.7_0.17_75)]",
                trail.safety.status === "warning" && "bg-[oklch(0.6_0.22_25)]",
              )}
            />
            <span
              className={cn(
                "relative inline-flex size-2 rounded-full",
                trail.safety.status === "safe" && "bg-[oklch(0.55_0.18_145)]",
                trail.safety.status === "caution" && "bg-[oklch(0.65_0.18_75)]",
                trail.safety.status === "warning" && "bg-[oklch(0.55_0.22_25)]",
              )}
            />
          </span>
          <SafetyIcon className="size-3.5 shrink-0" />
          <span className="truncate">{trail.safety.label}</span>
        </div>

        {/* Actions */}
        {onSave ? (
          <div className="grid grid-cols-[2.5rem_1fr] gap-2">
            <button
              type="button"
              onClick={() => onPin(trail.id)}
              className="grid size-10 place-items-center rounded-xl bg-[var(--gradient-aegean)] text-primary-foreground shadow-[var(--shadow-soft)] transition hover:opacity-95 active:scale-[0.99]"
              aria-label={`Pin ${trail.name} to map`}
              title="Pin to map"
            >
              <MapPin className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onSave(trail.id)}
              disabled={isSaved}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-[13px] font-semibold text-foreground shadow-[var(--shadow-soft)] transition hover:border-primary/40 hover:text-primary disabled:cursor-default disabled:border-[oklch(0.85_0.1_145)] disabled:bg-[oklch(0.96_0.04_145)] disabled:text-[oklch(0.38_0.12_145)]"
            >
              {isSaved ? (
                <BookmarkCheck className="size-3.5 shrink-0" />
              ) : (
                <BookmarkPlus className="size-3.5 shrink-0" />
              )}
              <span className="truncate">{isSaved ? "Saved" : "Save trail"}</span>
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => onPin(trail.id)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2 text-[13px] font-semibold text-primary-foreground shadow-[var(--shadow-soft)] transition hover:opacity-95 active:scale-[0.99]"
          >
            <MapPin className="size-3.5" />
            Pin to map
          </button>
        )}
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label }: { icon: typeof Clock; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-foreground/80">
      <Icon className="size-3 text-[var(--olive)]" />
      {label}
    </span>
  );
}
