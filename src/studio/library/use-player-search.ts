"use client";

import { useEffect, useMemo, useState } from "react";
import type { PlayerHit, PlayerSource } from "@/src/lib/player-types";
import { searchXdPlayers } from "@/src/lib/xd-database/client";
import { xdPlayerHit } from "@/src/lib/xd-database/players";
import { localPlayerHits, mergePlayerHits } from "@/src/lib/players/local-files";
import { useStudioStore } from "@/src/store/studio-store";

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 280;
const MAX_XD_HITS = 10;

export type PlayerSearchState = {
  query: string;
  setQuery: (query: string) => void;
  /** True once the query is long enough to search. */
  searching: boolean;
  hits: PlayerHit[];
  loading: boolean;
  /** Sources the search could not reach (only Base Xadrez Digital is tracked client side). */
  failedSources: PlayerSource[];
};

// SIG-1318: debounced (280 ms) player search against `/api/players/search`;
// a new query aborts the in-flight request. SIG-1333: players from the PGN
// files loaded in the Library are searched in memory (signed in or not) and
// merged with the server hits, `studio` players shown once by lower-cased name.
//
// SIG-1468: `includeXd` also lists Base Xadrez Digital players (a separate
// request, so its failure never hides the other sources).
export function usePlayerSearch({ includeXd = false }: { includeXd?: boolean } = {}): PlayerSearchState {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<PlayerHit[]>([]);
  const [xdHits, setXdHits] = useState<PlayerHit[]>([]);
  const [xdFailed, setXdFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const locale = useStudioStore((state) => state.settings.locale);
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
      const server = fetch(`/api/players/search?q=${encodeURIComponent(q)}`, { signal: controller.signal })
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
        });
      const xd = includeXd
        ? searchXdPlayers(q, controller.signal)
          .then((players) => {
            setXdHits(players.slice(0, MAX_XD_HITS).map((player) => xdPlayerHit(player, locale)));
            setXdFailed(false);
          })
          .catch((error: unknown) => {
            if (error instanceof DOMException && error.name === "AbortError") {
              return;
            }
            setXdHits([]);
            setXdFailed(true);
          })
        : Promise.resolve();
      void Promise.all([server, xd]).finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });
    }, DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, includeXd, locale]);

  const merged = useMemo(
    () => (searching
      ? [...mergePlayerHits(localPlayerHits(databases, query), hits), ...(includeXd ? xdHits : [])]
      : []),
    [searching, databases, query, hits, includeXd, xdHits],
  );

  return {
    query, setQuery, searching, hits: merged, loading: searching && loading,
    failedSources: searching && includeXd && xdFailed ? ["xadrez-digital"] : [],
  };
}
