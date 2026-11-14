"use client";

import { useEffect, useMemo, useState } from "react";
import type { PlayerHit } from "@/src/lib/player-types";
import { localPlayerHits, mergePlayerHits } from "@/src/lib/players/local-files";
import { useStudioStore } from "@/src/store/studio-store";

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 280;

export type PlayerSearchState = {
  query: string;
  setQuery: (query: string) => void;
  /** True once the query is long enough to search. */
  searching: boolean;
  hits: PlayerHit[];
  loading: boolean;
};

// SIG-1318: debounced (280 ms) player search against `/api/players/search`;
// a new query aborts the in-flight request. SIG-1333: players from the PGN
// files loaded in the Library are searched in memory (signed in or not) and
// merged with the server hits, `studio` players shown once by lower-cased name.
export function usePlayerSearch(): PlayerSearchState {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<PlayerHit[]>([]);
  const [loading, setLoading] = useState(false);
  const databases = useStudioStore((state) => state.files.databases);

  const searching = query.trim().length >= MIN_QUERY_LENGTH;

  useEffect(() => {
    const q = query.trim();
    if (q.length < MIN_QUERY_LENGTH) {
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      void fetch(`/api/players/search?q=${encodeURIComponent(q)}`, { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error("search failed");
          }
          return (await response.json()) as { players: PlayerHit[] };
        })
        .then((payload) => setHits(payload.players))
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") {
            return;
          }
          setHits([]);
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setLoading(false);
          }
        });
    }, DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const merged = useMemo(
    () => (searching ? mergePlayerHits(localPlayerHits(databases, query), hits) : []),
    [searching, databases, query, hits],
  );

  return { query, setQuery, searching, hits: merged, loading: searching && loading };
}
