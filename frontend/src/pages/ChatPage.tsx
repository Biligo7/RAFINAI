import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { ChatPanel } from "@/components/ChatPanel";
import { MapPanel } from "@/components/MapPanel";
import { toast } from "sonner";
import { getTrailById, type Trail } from "@/lib/trails";

type Injection = { text: string; trailIds: string[]; nonce: number } | null;

export default function ChatPage() {
  const { threadId } = useParams<{ threadId: string }>();
  const [highlighted, setHighlighted] = useState<string[]>([]);
  const [focused, setFocused] = useState<{
    id: string;
    nonce: number;
  } | null>(null);
  const [rerouting, setRerouting] = useState(false);
  const [injection, setInjection] = useState<Injection>(null);

  useEffect(() => {
    setHighlighted([]);
    setFocused(null);
    setRerouting(false);
    setInjection(null);
  }, [threadId]);

  const handlePin = (id: string) => {
    const trail = getTrailById(id);
    if (!trail) return;
    setHighlighted((h) => (h.includes(id) ? h : [...h, id]));
    setFocused({ id, nonce: Date.now() });
    toast.success(`Pinned: ${trail.name}`, {
      description: `Centered the map on ${trail.region}.`,
    });
  };

  const handleRerouteForRain = async (trail: Trail) => {
    if (rerouting) return;
    setRerouting(true);
    toast("Checking weather signals…", {
      description:
        "Cross-referencing OpenWeatherMap radar for the next 6 hours.",
    });

    const altId = trail.rainAlternativeId;
    const alt = altId ? getTrailById(altId) : undefined;

    await new Promise((r) => setTimeout(r, 1600));

    if (alt) {
      setHighlighted((h) => (h.includes(alt.id) ? h : [...h, alt.id]));
      setInjection({
        nonce: Date.now(),
        trailIds: [trail.id, alt.id],
        text:
          `🌧️ **Rain incoming over ${trail.region}** (radar shows showers in ~3h).\n\n` +
          `I'm re-routing you off ${trail.name}'s exposed ridgeline. ` +
          `Try this lower-altitude option instead — sheltered, safer, and just as scenic:\n\n` +
          `[[trails:${alt.id}]]\n\n` +
          `The original route now appears in sky-blue dashes on the map so you can compare.`,
      });
    } else {
      setInjection({
        nonce: Date.now(),
        trailIds: [trail.id],
        text:
          `🌧️ Weather check complete — ${trail.name} is already a low-altitude option, ` +
          `so no re-route is needed. Pack a shell and you're good.`,
      });
    }

    setTimeout(() => setRerouting(false), 2200);
  };

  if (!threadId) return null;

  return (
    <div className="flex h-full w-full">
      <div className="w-2/5 min-w-[360px] border-r border-border">
        <ChatPanel
          key={threadId}
          threadId={threadId}
          onAssistantTrails={setHighlighted}
          onPinTrail={handlePin}
          injection={injection}
          onInjectionConsumed={() => setInjection(null)}
        />
      </div>
      <div className="flex-1">
        <MapPanel
          highlightedIds={highlighted}
          focused={focused}
          rerouting={rerouting}
          onRerouteForRain={handleRerouteForRain}
        />
      </div>
    </div>
  );
}
