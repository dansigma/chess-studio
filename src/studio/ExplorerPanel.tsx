"use client";

import { explorerSourceTitle } from "@/src/lib/explorer-types";
import { formatSan, sideFromFen } from "@/src/chess/move-notation";
import { useStudioStore } from "@/src/store/studio-store";
import { ExplorerFiltersBar } from "./ExplorerFiltersBar";

export function ExplorerPanel() {
  const explorer = useStudioStore((state) => state.explorer);
  const loading = useStudioStore((state) => state.explorerLoading);
  const source = useStudioStore((state) => state.databaseSource);
  const databases = useStudioStore((state) => state.files.databases);
  const makeUciMove = useStudioStore((state) => state.makeUciMove);
  const moveNotation = useStudioStore((state) => state.settings.moveNotation);
  const filters = useStudioStore((state) => state.settings.explorerFilters);
  const setExplorerFilters = useStudioStore((state) => state.setExplorerFilters);
  const maxGames = Math.max(1, ...(explorer?.moves.map((row) => row.games) ?? [1]));
  const title = explorerSourceTitle(source, databases);
  const side = explorer ? sideFromFen(explorer.fen) : "w";

  return (
    <div className="flex h-full flex-col bg-studio-panel text-[13px] text-studio-fg">
      <div className="flex items-center justify-between border-b border-studio-border-subtle px-3 py-2 text-[11px] uppercase tracking-wide text-studio-faint">
        <span>{title}</span>
        <span>{explorer ? `${explorer.white + explorer.draws + explorer.black} games` : ""}</span>
      </div>
      <ExplorerFiltersBar source={source} filters={filters} onChange={setExplorerFilters} />
      {explorer?.opening ? (
        <div className="border-b border-studio-border-subtle px-3 py-2 text-xs text-studio-muted">
          {explorer.opening.eco} {explorer.opening.name}
        </div>
      ) : null}
      {explorer?.notice ? (
        <div className="border-b border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-200/80">
          {explorer.notice}
        </div>
      ) : null}
      <div className="grid grid-cols-[72px_1fr_120px] gap-2 border-b border-studio-border-subtle px-3 py-1.5 text-[11px] uppercase text-studio-faint">
        <span>Move</span>
        <span>Games</span>
        <span>W / D / L</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {loading ? (
          <div className="px-3 py-4 text-studio-faint">Loading explorer…</div>
        ) : null}
        {!loading && (explorer?.moves.length ?? 0) === 0 ? (
          <div className="px-3 py-4 text-studio-faint">No games for this position.</div>
        ) : null}
        {explorer?.moves.map((row) => {
          const total = Math.max(1, row.games);
          return (
            <button
              key={row.uci}
              className="grid w-full grid-cols-[72px_1fr_120px] items-center gap-2 px-3 py-1.5 text-left hover:bg-studio-hover-subtle"
              onClick={() => {
                const from = row.uci.slice(0, 2);
                const to = row.uci.slice(2, 4);
                const promotion = row.uci[4];
                makeUciMove(from, to, promotion);
              }}
            >
              <span className="font-medium">{formatSan(row.san, moveNotation, side)}</span>
              <span className="flex items-center gap-2">
                <span className="w-10 text-right text-studio-muted">
                  {row.games.toLocaleString()}
                </span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-800">
                  <span
                    className="block h-full bg-[#5b8def]"
                    style={{ width: `${(row.games / maxGames) * 100}%` }}
                  />
                </span>
              </span>
              <span className="flex h-2 overflow-hidden rounded-full">
                <span
                  className="bg-emerald-500"
                  style={{ width: `${(row.white / total) * 100}%` }}
                />
                <span
                  className="bg-zinc-400"
                  style={{ width: `${(row.draws / total) * 100}%` }}
                />
                <span
                  className="bg-red-500"
                  style={{ width: `${(row.black / total) * 100}%` }}
                />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
