"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { searchFilesForPosition, type FilePositionHit } from "@/src/lib/files-explorer";
import type { FileGame } from "@/src/lib/user-files";
import { tPanels } from "@/src/i18n/studio-panel-strings.ts";
import { useStudioStore } from "@/src/store/studio-store";
import { useActiveFen } from "@/src/store/hooks";
import { IconButton } from "./ui/Button";

function resultLabel(winner: "white" | "black" | "draw" | null): string | null {
  if (winner === "white") {
    return "1-0";
  }
  if (winner === "black") {
    return "0-1";
  }
  if (winner === "draw") {
    return "½-½";
  }
  return null;
}

export function PositionSearchPanel() {
  const locale = useStudioStore((state) => state.settings.locale);
  const fen = useActiveFen();
  const databases = useStudioStore((state) => state.files.databases);
  const openFileGame = useStudioStore((state) => state.openFileGame);
  const [debouncedFen, setDebouncedFen] = useState(fen);
  const [hits, setHits] = useState<FilePositionHit[]>([]);
  const [loading, setLoading] = useState(true);
  const [retryTick, setRetryTick] = useState(0);

  // SIG-909: library signature mirrors personalSignature so the search
  // re-runs when any database id or game list changes.
  const librarySignature = useMemo(
    () => databases.map((database) => `${database.id}:${database.games.map((game) => game.id).join(",")}`).join("|"),
    [databases],
  );

  const gameById = useMemo(() => {
    const map = new Map<string, FileGame>();
    for (const database of databases) {
      for (const game of database.games) {
        map.set(game.id, game);
      }
    }
    return map;
  }, [databases]);

  /* eslint-disable react-hooks/set-state-in-effect -- SIG-864/909: the
     loading start is intentionally synchronous so a new position never sits
     one debounce in loading:false and flashes "Not in any file" before
     "Searching files…". */
  useEffect(() => {
    // SIG-864 pattern: loading starts synchronously so the panel never
    // flashes the empty state before the debounced lookup runs.
    setLoading(true);
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const result = searchFilesForPosition(databases, fen);
      if (cancelled) {
        return;
      }
      setHits(result);
      setDebouncedFen(fen);
      setLoading(false);
    }, 160);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fen, librarySignature, retryTick]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const total = hits.reduce((sum, hit) => sum + hit.games.length, 0);
  const stale = fen !== debouncedFen;
  const showLoading = loading || stale;
  const side = fen.split(" ")[1] === "b"
    ? tPanels(locale, "search.blackToMove")
    : tPanels(locale, "search.whiteToMove");

  return (
    <div className="flex h-full flex-col bg-studio-panel text-dense text-studio-fg">
      <div className="flex items-center gap-2 border-b border-studio-border-subtle px-3 py-2 text-caption text-studio-faint">
        <span className="min-w-0 flex-1 truncate" title={debouncedFen}>
          {side}
        </span>
        {!showLoading ? (
          <span className="shrink-0 tabular-nums">
            {total === 1
              ? tPanels(locale, "search.count.one", { count: total })
              : tPanels(locale, "search.count.other", { count: total })}
          </span>
        ) : null}
        <IconButton
          label={tPanels(locale, "search.refresh")}
          size="sm"
          className="text-studio-muted"
          onClick={() => setRetryTick((tick) => tick + 1)}
        >
          <RefreshCw size={14} />
        </IconButton>
      </div>
      <div className="min-h-0 flex-1 overflow-auto" aria-busy={showLoading || undefined}>
        {showLoading ? (
          <div className="px-3 py-4 text-studio-faint" role="status">
            {tPanels(locale, "search.loading")}
          </div>
        ) : total === 0 ? (
          <div className="px-3 py-4 text-studio-faint">{tPanels(locale, "search.empty")}</div>
        ) : (
          hits.map((hit) => (
            <div key={hit.databaseId} className="border-b border-studio-border-subtle last:border-b-0">
              <div className="flex items-center justify-between px-3 py-2 text-caption text-studio-faint">
                <span className="min-w-0 flex-1 truncate font-semibold">{hit.databaseName}</span>
                <span className="shrink-0 tabular-nums">{hit.games.length}</span>
              </div>
              {hit.games.map((row) => {
                const fileGame = gameById.get(row.id);
                const result = resultLabel(row.winner);
                const date = row.year ? `${row.year}${row.month ? `.${String(row.month).padStart(2, "0")}` : ""}` : null;
                return (
                  <button
                    key={row.id}
                    type="button"
                    className="flex w-full items-baseline justify-between gap-2 px-3 py-1.5 text-left hover:bg-studio-hover-subtle"
                    onClick={() => {
                      if (fileGame) {
                        openFileGame(fileGame, { atFen: debouncedFen });
                      }
                    }}
                    disabled={!fileGame}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {row.whiteName} {tPanels(locale, "notation.header.vs")} {row.blackName}
                      {row.event ? <span className="text-studio-faint"> · {row.event}</span> : null}
                    </span>
                    <span className="flex shrink-0 items-baseline gap-2 text-studio-faint">
                      {result ? <span>{result}</span> : null}
                      {date ? <span className="tabular-nums">{date}</span> : null}
                    </span>
                  </button>
                );
              })}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
