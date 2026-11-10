"use client";

import { useEffect, useRef, useState } from "react";
import { runMyGamesBackfill } from "@/src/lib/my-games/index-backfill";

export type MyGamesIndexingState =
  | { phase: "idle" }
  | { phase: "running"; remaining: number | null }
  | { phase: "incomplete" };

// One full backfill per page load is enough: games synced later are indexed by
// the sync route (or by the next page load's backfill).
let finishedThisSession = false;

/**
 * SIG-1275: while `active` (a position filter with My Games selected), index
 * the user's older games and call `onIndexed` when new games became searchable.
 */
export function useMyGamesIndexing(active: boolean, onIndexed: () => void): MyGamesIndexingState {
  const [state, setState] = useState<MyGamesIndexingState>({ phase: "idle" });
  const onIndexedRef = useRef(onIndexed);
  useEffect(() => {
    onIndexedRef.current = onIndexed;
  }, [onIndexed]);

  useEffect(() => {
    if (!active || finishedThisSession) {
      return;
    }
    const controller = new AbortController();
    void runMyGamesBackfill({
      signal: controller.signal,
      onProgress: (remaining) => {
        if (remaining !== 0) {
          setState({ phase: "running", remaining });
        }
      },
    }).then((outcome) => {
      if (outcome.status === "aborted") {
        return;
      }
      finishedThisSession = outcome.status === "done";
      setState(outcome.status === "done" ? { phase: "idle" } : { phase: "incomplete" });
      if (outcome.indexed > 0) {
        onIndexedRef.current();
      }
    });
    return () => controller.abort();
  }, [active]);

  return active ? state : { phase: "idle" };
}
