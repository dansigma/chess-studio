"use client";

import { useMemo } from "react";
import type { PlayerColorFilter, PlayerGame, PlayerResultFilter } from "@/src/lib/player-types";
import { bookmarkKey } from "@/src/lib/player-bookmarks";
import { playerMoveStatsFromIndex, buildPlayerIndex } from "@/src/lib/player-stats";
import { useActiveFen } from "@/src/store/hooks";
import { useStudioStore } from "@/src/store/studio-store";
import { formatSan, sideFromFen } from "@/src/chess/move-notation";
import { BookmarkStar } from "./PlayerHitRow";
import { ResultBar } from "./ui/ResultBar";

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded px-2 py-0.5 text-caption ${
        active ? "bg-studio-hover-strong text-studio-fg" : "text-studio-faint hover:bg-studio-hover-subtle hover:text-studio-fg"
      }`}
    >
      {children}
    </button>
  );
}

function filteredGames(
  games: PlayerGame[],
  color: PlayerColorFilter,
  result: PlayerResultFilter,
): PlayerGame[] {
  return games.filter((game) => {
    if (color !== "all" && game.color !== color) {
      return false;
    }
    if (result !== "all" && game.playerResult !== result) {
      return false;
    }
    return true;
  });
}

export function PlayerExplorerPanel() {
  const player = useStudioStore((state) => state.playerProfile);
  const games = useStudioStore((state) => state.playerGames);
  const loading = useStudioStore((state) => state.playerGamesLoading);
  const color = useStudioStore((state) => state.playerColorFilter);
  const result = useStudioStore((state) => state.playerResultFilter);
  const setColor = useStudioStore((state) => state.setPlayerColorFilter);
  const setResult = useStudioStore((state) => state.setPlayerResultFilter);
  const makeUciMove = useStudioStore((state) => state.makeUciMove);
  const moveNotation = useStudioStore((state) => state.settings.moveNotation);
  const fen = useActiveFen();
  const side = sideFromFen(fen);
  const togglePlayerBookmark = useStudioStore((state) => state.togglePlayerBookmark);
  const bookmarked = useStudioStore((state) =>
    player ? state.bookmarks.some((item) => bookmarkKey(item) === bookmarkKey(player)) : false,
  );

  const visible = useMemo(() => filteredGames(games, color, result), [games, color, result]);
  const index = useMemo(() => buildPlayerIndex(visible), [visible]);
  const moves = useMemo(() => playerMoveStatsFromIndex(index, fen), [index, fen]);
  const maxGames = Math.max(1, ...moves.map((row) => row.games), 1);

  if (!player) {
    return (
      <div className="flex h-full items-center justify-center bg-studio-panel text-sm text-studio-faint">
        Search a player to see their openings.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-studio-panel text-body text-studio-fg">
      <div className="flex flex-wrap items-center gap-1 border-b border-studio-border-subtle px-2 py-1.5">
        {(["all", "white", "black"] as const).map((value) => (
          <Chip key={value} active={color === value} onClick={() => setColor(value)}>
            {value === "all" ? "All" : value === "white" ? "White" : "Black"}
          </Chip>
        ))}
        <span className="mx-1 h-4 w-px bg-studio-hover" />
        {(["all", "win", "loss", "draw"] as const).map((value) => (
          <Chip key={value} active={result === value} onClick={() => setResult(value)}>
            {value === "all" ? "All" : value === "win" ? "Won" : value === "loss" ? "Lost" : "Draw"}
          </Chip>
        ))}
        <span className="ml-auto flex items-center gap-1 pr-1 text-caption text-studio-faint">
          <span>
            {visible.length} game{visible.length === 1 ? "" : "s"}
          </span>
          <BookmarkStar active={bookmarked} onClick={() => togglePlayerBookmark(player)} />
        </span>
      </div>
      <div className="grid grid-cols-[64px_minmax(0,1fr)_minmax(96px,160px)] gap-3 border-b border-studio-border-subtle px-3 py-1.5 text-caption uppercase tracking-wider text-studio-faint">
        <span>Move</span>
        <span>Games</span>
        <span>White · Draw · Black</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {loading ? <div className="px-3 py-4 text-studio-faint">Loading games…</div> : null}
        {!loading && moves.length === 0 ? (
          <div className="px-3 py-4 text-studio-faint">No games reach this position.</div>
        ) : null}
        {moves.map((row) => {
          return (
            <button
              key={row.uci}
              className="grid w-full grid-cols-[64px_minmax(0,1fr)_minmax(96px,160px)] items-center gap-3 px-3 py-1.5 text-left hover:bg-studio-hover"
              onClick={() => {
                const from = row.uci.slice(0, 2);
                const to = row.uci.slice(2, 4);
                const promotion = row.uci[4];
                makeUciMove(from, to, promotion);
              }}
            >
              <span className="font-medium">{formatSan(row.san, moveNotation, side)}</span>
              <span className="flex items-center gap-2">
                <span className="w-10 text-right tabular-nums text-studio-fg">{row.games.toLocaleString()}</span>
                <span className="h-1 flex-1 overflow-hidden rounded-full bg-studio-track">
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
    </div>
  );
}
