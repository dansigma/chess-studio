"use client";

import { useEffect, useState } from "react";
import { fetchTour } from "@/src/lib/live/lichess-broadcast";
import type { BroadcastTour } from "@/src/lib/live/types";
import { enqueueLiveRequest } from "./live-store";

/** Tour (its rounds and group) for the selectors, through the shared request queue. Null until loaded. */
export function useLiveTour(tourId: string | null): BroadcastTour | null {
  const [loaded, setLoaded] = useState<BroadcastTour | null>(null);
  useEffect(() => {
    if (!tourId) {
      return;
    }
    const controller = new AbortController();
    enqueueLiveRequest((signal) => fetchTour(tourId, signal), { signal: controller.signal })
      .then((tour) => {
        if (tour && !controller.signal.aborted) {
          setLoaded(tour);
        }
      })
      .catch(() => undefined); // the selectors fall back to the current round only
    return () => controller.abort();
  }, [tourId]);
  return loaded && loaded.tour.id === tourId ? loaded : null;
}

/** Round to open when switching to a tour: its default, else the ongoing one, else the last. */
export function pickRoundForTour(tour: BroadcastTour): string | null {
  return (
    tour.defaultRoundId ??
    tour.rounds.find((r) => r.ongoing)?.id ??
    tour.rounds[tour.rounds.length - 1]?.id ??
    null
  );
}
