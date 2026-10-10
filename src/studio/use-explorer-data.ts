"use client";

import { useEffect, useState } from "react";
import { useActiveFen } from "@/src/store/hooks";
import { useStudioStore } from "@/src/store/studio-store";
import { studioFilterQuery } from "@/src/lib/explorer-filters";
import {
  fileDatabaseId,
  type ExplorerResponse,
  type ExplorerSource,
} from "@/src/lib/explorer-types";
import { lookupChesscomExplorer, lookupFilesExplorer } from "@/src/lib/files-explorer";

export type ExplorerData = {
  explorer: ExplorerResponse | null;
  loading: boolean;
  error: string | null;
};

/**
 * SIG-908: shared explorer fetch behind every explorer panel. Each caller
 * passes its own `source` and keeps its own loading / error / retry state in
 * local `useState` (not the global store fields — those feed only the legacy
 * bare `explorer` panel + `GamesPanel`). Semantics match the pre-extraction
 * `StudioShell` effect (SIG-864 state machine): sync error clear + sync
 * loading start, 160 ms debounce only around the network fetch, `file:` via
 * `lookupFilesExplorer` with the empty-payload fallback, `chesscom` via
 * `lookupChesscomExplorer`, last-good payload kept on error.
 */
export function useExplorerData(source: ExplorerSource, retrySignal = 0): ExplorerData {
  const fen = useActiveFen();
  const explorerFilters = useStudioStore((state) => state.settings.explorerFilters);
  const playerProfile = useStudioStore((state) => state.playerProfile);
  const playerGames = useStudioStore((state) => state.playerGames);
  // SIG-857: primitive signature — the old `state.files` object re-rendered
  // the shell on every library change; this string changes only when the
  // selected database's game ids change.
  const personalSignature = useStudioStore((state) => {
    const fileId = fileDatabaseId(source);
    if (!fileId) {
      return "";
    }
    return (
      state.files.databases.find((item) => item.id === fileId)?.games.map((game) => game.id).join(",") ?? ""
    );
  });
  const [explorer, setExplorer] = useState<ExplorerResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect -- SIG-864/908: the
     error clear + loading start are intentionally synchronous so a new
     position never sits one debounce in {error: null, loading: false} and
     flashes "No games" before "Loading explorer…". */
  useEffect(() => {
    let cancelled = false;
    // A new search clears the previous failure; only the network .catch below
    // sets it again. The last-good payload stays so the panel can keep it
    // behind the error banner instead of blanking to "No games".
    setError(null);
    const fileId = fileDatabaseId(source);
    if (fileId) {
      const database = useStudioStore.getState().files.databases.find((item) => item.id === fileId);
      setExplorer(
        database
          ? lookupFilesExplorer(database, fen, explorerFilters)
          : {
              source,
              fen,
              white: 0,
              draws: 0,
              black: 0,
              opening: null,
              moves: [],
              games: [],
            },
      );
      setLoading(false);
      return;
    }
    if (source === "chesscom") {
      const games = playerProfile?.source === "chesscom" ? playerGames : [];
      setExplorer(lookupChesscomExplorer(games, fen, explorerFilters));
      setLoading(false);
      return;
    }
    const filterQuery = studioFilterQuery(explorerFilters);
    // Choice (b): loading starts synchronously with the error clear above —
    // the 160 ms timer delays only the fetch. Otherwise the panel sits one
    // debounce in {error: null, loading: false, explorer: null} and flashes
    // the false "No games" before "Loading explorer…".
    setLoading(true);
    const timer = window.setTimeout(() => {
      void fetch(`/api/explorer?fen=${encodeURIComponent(fen)}&source=${source}${filterQuery}`)
        .then(async (response) => {
          if (!response.ok) {
            throw new Error("explorer failed");
          }
          return (await response.json()) as ExplorerResponse;
        })
        .then((payload) => {
          if (!cancelled) {
            setExplorer(payload);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setError("explorer request failed");
          }
        })
        .finally(() => {
          if (!cancelled) {
            setLoading(false);
          }
        });
    }, 160);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [fen, source, personalSignature, explorerFilters, playerProfile, playerGames, retrySignal]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return { explorer, loading, error };
}
