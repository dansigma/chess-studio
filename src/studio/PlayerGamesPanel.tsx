"use client";

import { useMemo } from "react";
import { formatYearMonth } from "@/src/lib/game-date";
import type { PlayerGame } from "@/src/lib/player-types";
import { loadXdGamePgn } from "@/src/lib/xd-database/client";
import { tPanels } from "@/src/i18n/studio-panel-strings.ts";
import { tPrep } from "@/src/i18n/prep-strings";
import { selectActiveBoard, useStudioStore } from "@/src/store/studio-store";
import { openBoardPanel } from "./dock-api";
import { openPlayerDossier } from "./library/dossier/open-player-dossier";
import { GameOpenRow } from "./GameOpenRow";
import { filterPlayerGames } from "@/src/lib/player-stats";
import { useLegacyPlayerGames } from "./use-player-games";
import { ResultMark } from "./ResultMark";
import { PlayerCell, outcomeFor } from "./ui/PlayerCell";

export function PlayerGamesPanel() {
  const locale = useStudioStore((state) => state.settings.locale);
  const player = useStudioStore((state) => state.playerProfile);
  const { games, loading, notice } = useLegacyPlayerGames(player);
  const color = useStudioStore((state) => state.playerColorFilter);
  const result = useStudioStore((state) => state.playerResultFilter);
  const visible = useMemo(() => filterPlayerGames(games, color, result), [games, color, result]);

  const countString =
    visible.length === 1
      ? tPanels(locale, "players.count.one", { count: visible.length })
      : tPanels(locale, "players.count.other", { count: visible.length });

  if (!player) {
    return (
      <div className="flex h-full items-center justify-center bg-studio-panel text-sm text-studio-faint">
        {tPanels(locale, "players.searchGames")}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-studio-panel text-dense text-studio-fg">
      <div className="flex items-center justify-between border-b border-studio-border-subtle px-3 py-2 text-caption text-studio-faint">
        <span className="truncate">{tPanels(locale, "players.gamesTitle", { name: player.displayName })}</span>
        <span className="flex items-center gap-2">
          {notice ? tPanels(locale, "players.countNote", { count: countString }) : countString}
          {player.source === "lichess" || player.source === "chesscom" ? (
            <button
              type="button"
              onClick={() => openPlayerDossier(player)}
              className="shrink-0 font-medium text-studio-accent-text hover:underline"
            >
              {tPrep(locale, "prep.prepareAgainst")}
            </button>
          ) : null}
        </span>
      </div>
      {notice ? (
        <div className="border-b border-studio-border-subtle bg-studio-warning-bg px-3 py-1.5 text-caption text-studio-warning-fg">
          {notice}
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-auto" aria-busy={loading || undefined}>
        {loading ? (
          <div className="px-3 py-4 text-studio-faint" role="status">
            {tPanels(locale, "players.loading")}
          </div>
        ) : null}
        <PlayerGameRows games={visible} />
        {!loading && visible.length === 0 ? (
          <div className="px-3 py-4 text-studio-faint">{tPanels(locale, "players.empty")}</div>
        ) : null}
      </div>
    </div>
  );
}

export function PlayerGameRows({ games }: { games: PlayerGame[] }) {
  const locale = useStudioStore((state) => state.settings.locale);
  const importPlayerGame = useStudioStore((state) => state.importPlayerGame);
  const setStatus = useStudioStore((state) => state.setStatus);

  function openGame(game: PlayerGame, openInNewBoard = false) {
    if (game.xdId !== undefined) {
      // Base Xadrez Digital lines are cut at 50 plies: open the full game.
      void loadXdGamePgn(String(game.xdId)).then(
        (pgn) => showGame({ ...game, pgn, moves: undefined }, openInNewBoard),
        () => setStatus(tPanels(locale, "players.noPgn")),
      );
      return;
    }
    if (!game.pgn && !game.moves) {
      setStatus(tPanels(locale, "players.noPgn"));
      return;
    }
    showGame(game, openInNewBoard);
  }

  function showGame(game: PlayerGame, openInNewBoard: boolean) {
    importPlayerGame(game, { openInNewBoard });
    setStatus(null);
    // SIG-911: the import activates a board session in the store, so reveal
    // its `board:*` panel too — otherwise the game sits on an invisible board
    // and notation navigation looks frozen. Unconditional: it covers the
    // preview board on a plain click and the new board opened via
    // double-click/Shift+Enter.
    const active = selectActiveBoard(useStudioStore.getState());
    openBoardPanel(active.id, active.title);
  }

  return (
    <>
      <div className="grid grid-cols-[24px_minmax(0,1fr)_minmax(0,1fr)_50px] gap-x-2 border-b border-studio-border-subtle px-3 py-1.5 text-[10px] uppercase tracking-wide text-studio-faint">
        <span className="truncate">{tPanels(locale, "games.column.result")}</span>
        <span className="truncate">{tPanels(locale, "games.column.white")}</span>
        <span className="truncate">{tPanels(locale, "games.column.black")}</span>
        <span className="truncate">{tPanels(locale, "games.column.date")}</span>
      </div>
      {games.map((game) => (
        <GameOpenRow
          key={game.id}
          className="grid w-full grid-cols-[24px_minmax(0,1fr)_minmax(0,1fr)_50px] items-center gap-x-2 px-3 py-1.5 text-left hover:bg-studio-hover"
          onOpen={() => openGame(game)}
          onOpenNew={() => openGame(game, true)}
        >
          <ResultMark winner={game.winner} />
          <PlayerCell name={game.whiteName} rating={game.whiteRating ?? null} outcome={outcomeFor(game.winner, "white")} />
          <PlayerCell name={game.blackName} rating={game.blackRating ?? null} outcome={outcomeFor(game.winner, "black")} />
          <span className="truncate tabular-nums text-studio-faint">{formatYearMonth(game.year, game.month)}</span>
        </GameOpenRow>
      ))}
    </>
  );
}
