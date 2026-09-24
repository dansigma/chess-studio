"use client";

import { explorerSourceTitle } from "@/src/lib/explorer-types";
import { formatSan, sideFromFen } from "@/src/chess/move-notation";
import { useStudioStore } from "@/src/store/studio-store";
import { ExplorerFiltersBar } from "./ExplorerFiltersBar";
import { Badge } from "./ui/Controls";
import { ResultBar } from "./ui/ResultBar";

const compactCount = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

const ROW_GRID = "grid grid-cols-[64px_minmax(0,1fr)_minmax(96px,160px)] items-center gap-3 px-3";

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
  const totalGames = explorer ? explorer.white + explorer.draws + explorer.black : 0;
  const hasMoves = (explorer?.moves.length ?? 0) > 0;

  return (
    <div className="flex h-full flex-col bg-studio-panel text-body text-studio-fg">
      <div className="flex items-center justify-between gap-2 border-b border-studio-border-subtle px-3 py-2">
        <span className="truncate text-dense font-semibold">{title}</span>
        {explorer ? (
          <span className="shrink-0 text-caption tabular-nums text-studio-faint">
            {totalGames.toLocaleString()} {totalGames === 1 ? "game" : "games"}
          </span>
        ) : null}
      </div>
      <ExplorerFiltersBar source={source} filters={filters} onChange={setExplorerFilters} />
      {explorer?.opening ? (
        <div className="flex items-center gap-2 border-b border-studio-border-subtle px-3 py-2 text-dense text-studio-muted">
          <Badge tone="accent">{explorer.opening.eco}</Badge>
          <span className="truncate">{explorer.opening.name}</span>
        </div>
      ) : null}
      {explorer?.notice ? (
        <div className="border-b border-studio-border-subtle bg-studio-warning-bg px-3 py-2 text-caption text-studio-warning-fg">
          {explorer.notice}
        </div>
      ) : null}
      <div
        className={`${ROW_GRID} relative border-b border-studio-border-subtle py-1.5 text-caption uppercase tracking-wider text-studio-faint`}
      >
        <span>Move</span>
        <span>Games</span>
        <span>White · Draw · Black</span>
        {loading ? (
          <span className="absolute inset-x-0 -bottom-px h-0.5 overflow-hidden" aria-label="Loading explorer">
            <span className="absolute inset-y-0 w-1/3 animate-[studio-progress_1.1s_ease-in-out_infinite] bg-studio-accent" />
          </span>
        ) : null}
      </div>
      <div className={`min-h-0 flex-1 overflow-auto transition-opacity ${loading && hasMoves ? "opacity-60" : ""}`}>
        {loading && !explorer ? (
          <div className="px-3 py-4 text-dense text-studio-faint">Loading explorer…</div>
        ) : null}
        {!loading && !hasMoves ? (
          <div className="px-3 py-4 text-dense text-studio-faint">No games for this position.</div>
        ) : null}
        {explorer?.moves.map((row) => {
          const share = totalGames > 0 ? (row.games / totalGames) * 100 : 0;
          return (
            <button
              key={row.uci}
              title={`${row.games.toLocaleString()} games`}
              className={`${ROW_GRID} w-full py-1.5 text-left hover:bg-studio-hover`}
              onClick={() => {
                const from = row.uci.slice(0, 2);
                const to = row.uci.slice(2, 4);
                const promotion = row.uci[4];
                makeUciMove(from, to, promotion);
              }}
            >
              <span className="font-semibold">{formatSan(row.san, moveNotation, side)}</span>
              <span className="flex min-w-0 items-center gap-2">
                <span className="w-11 shrink-0 text-right text-dense tabular-nums text-studio-fg">
                  {compactCount.format(row.games)}
                </span>
                <span className="w-9 shrink-0 text-right text-caption tabular-nums text-studio-faint">
                  {share >= 1 ? `${Math.round(share)}%` : "<1%"}
                </span>
                <span className="h-1 min-w-6 flex-1 overflow-hidden rounded-full bg-studio-track">
                  <span
                    className="block h-full rounded-full bg-studio-accent"
                    style={{ width: `${(row.games / maxGames) * 100}%` }}
                  />
                </span>
              </span>
              <ResultBar white={row.white} draws={row.draws} black={row.black} />
            </button>
          );
        })}
      </div>
      {explorer && hasMoves ? (
        <div className={`${ROW_GRID} border-t border-studio-border py-1.5 text-dense`}>
          <span className="font-semibold text-studio-muted">Total</span>
          <span className="flex items-center gap-2">
            <span className="w-11 shrink-0 text-right tabular-nums">{compactCount.format(totalGames)}</span>
            <span className="text-caption text-studio-faint">{explorer.moves.length} {explorer.moves.length === 1 ? "move" : "moves"}</span>
          </span>
          <ResultBar white={explorer.white} draws={explorer.draws} black={explorer.black} />
        </div>
      ) : null}
    </div>
  );
}
