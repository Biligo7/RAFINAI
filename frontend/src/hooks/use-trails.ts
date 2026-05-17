import { useEffect, useState } from "react";
import { ensureTrailsLoaded, getTrails, getTrailSource, type Trail } from "@/lib/trails";

/**
 * React hook that loads trails from the backend (OSM) on mount and
 * falls back to the built-in mock catalog if the backend is offline.
 */
export function useTrails() {
  const [trails, setTrails] = useState<Trail[]>(getTrails);
  const [source, setSource] = useState<"mock" | "live">(getTrailSource);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    ensureTrailsLoaded().then((loaded) => {
      if (cancelled) return;
      setTrails(loaded);
      setSource(getTrailSource());
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  return { trails, source, loading };
}
