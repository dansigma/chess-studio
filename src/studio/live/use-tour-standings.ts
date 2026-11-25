"use client";

import { useEffect } from "react";
import { fetchTourPlayers } from "@/src/lib/live/lichess-broadcast";
import type { BroadcastStandingRow } from "@/src/lib/live/types";
import { useStandingsCache, type StandingsEntry } from "./live-standings-cache";
import { enqueueLiveRequest, useLiveStore } from "./live-store";

const REFRESH_INTERVAL_MS = 60_000;
const EMPTY_ROWS: readonly BroadcastStandingRow[] = [];

function requestStandings(tourId: string): void {
  const previous = useStandingsCache.getState()[tourId];
  if (previous?.status === "loading" || (previous && Date.now() - previous.requestedAt < REFRESH_INTERVAL_MS)) {
    return;
  }
  const pending: StandingsEntry = {
    ...previous,
    rows: previous?.rows ?? null,
    status: "loading",
    requestedAt: Date.now(),
    revision: previous?.revision ?? 0,
  };
  useStandingsCache.setState({ [tourId]: pending });

  let { requestedAt, revision } = pending;
  const finish = (rows: BroadcastStandingRow[] | null) => {
    if (useStandingsCache.getState()[tourId] === pending) {
      useStandingsCache.setState({
        [tourId]: {
          ...pending,
          requestedAt,
          revision,
          rows: rows ?? pending.rows,
          status: rows ? "ready" : "error",
          refreshedAt: rows && previous ? requestedAt : previous?.refreshedAt,
        },
      });
    }
  };
  void enqueueLiveRequest((signal) => {
    const state = useLiveStore.getState();
    // Capture the revision when the queue dispatches, so changes while waiting are coalesced.
    requestedAt = Date.now();
    revision = state.resultRevisionByTour[tourId] ?? 0;
    const tour = Object.values(state.roundInfo).find((info) => info.tour.id === tourId)?.tour;
    return fetchTourPlayers(tourId, signal, tour?.fideTimeControl);
  }).then(finish, () => finish(null));
}

export function useTourStandings(tourId: string | null): {
  rows: readonly BroadcastStandingRow[];
  status: StandingsEntry["status"] | "idle";
} {
  const entry = useStandingsCache((cache) => (tourId ? cache[tourId] : undefined));
  const revision = useLiveStore((state) => (tourId ? state.resultRevisionByTour[tourId] ?? 0 : 0));

  useEffect(() => {
    // A failed request retries after the cooldown; a successful one waits for a result change.
    if (!tourId || entry?.status === "loading" || (entry?.status === "ready" && entry.revision === revision)) {
      return;
    }
    if (!entry) {
      requestStandings(tourId);
      return;
    }
    const delay = Math.max(0, entry.requestedAt + REFRESH_INTERVAL_MS - Date.now());
    const timer = setTimeout(() => requestStandings(tourId), delay);
    return () => clearTimeout(timer);
  }, [tourId, entry, revision]);

  return { rows: entry?.rows ?? EMPTY_ROWS, status: entry?.status ?? (tourId ? "loading" : "idle") };
}
