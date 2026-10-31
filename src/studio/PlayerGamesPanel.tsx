"use client";

import { useEffect, useMemo } from "react";
import { formatYearMonth } from "@/src/lib/game-date";
import type { PlayerGame, PlayerGamesResponse } from "@/src/lib/player-types";
import { tPanels } from "@/src/i18n/studio-panel-strings.ts";
import { tPrep } from "@/src/i18n/prep-strings";
import { selectActiveBoard, useStudioStore } from "@/src/store/studio-store";
import { openBoardPanel } from "./dock-api";
import { openOpponentPrepPanel } from "./OpponentPrepPanel";
import { GameOpenRow } from "./GameOpenRow";
import { ResultMark } from "./ResultMark";

export function PlayerGamesPanel() {
  const locale = useStudioStore((state) => state.settings.locale);
  const prepLocale = locale;
  const player = useStudioStore((state) => state.playerProfile);
  const games = useStudioStore((state) => state.playerGames);
  const loading = useStudioStore((state) => state.playerGamesLoading);
  const notice = useStudioStore((state) => state.playerGamesNotice);
  const color = useStudioStore((state) => state.playerColorFilter);
  const result = useStudioStore((state) => state.playerResultFilter);
  const setPlayerGames = useStudioStore((state) => state.setPlayerGames);
  const setPlayerGamesLoading = useStudioStore((state) => state.setPlayerGamesLoading);
  const importPlayerGame = useStudioStore((state) => state.importPlayerGame);
  const setStatus = useStudioStore((state) => state.setStatus);
  const playerId = player?.id ?? null;
  const playerSource = player?.source;
  const playerUsername = player?.username;
  const playerDisplayName = player?.displayName;
  const playerSubtitle = player?.subtitle;

  useEffect(() => {
    if (!playerId || !playerSource || !playerUsername) {
      return;
    }
    const controller = new AbortController();
    setPlayerGamesLoading(true);
    const params = new URLSearchParams({
      source: playerSource,
      username: playerUsername,
      displayName: playerDisplayName ?? playerUsername,
      subtitle: playerSubtitle ?? "",
    });
    void fetch(`/api/players/games?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Could not load games");
        }
        return (await response.json()) as PlayerGamesResponse;
      })
      .then((payload) => {
        setPlayerGames(payload.games, payload.notice ?? null);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setPlayerGames([], error instanceof Error ? error.message : "Could not load games");
      });
    return () => controller.abort();
  }, [
    playerId,
    playerSource,
    playerUsername,
    playerDisplayName,
    playerSubtitle,
    setPlayerGames,
    setPlayerGamesLoading,
  ]);

  const visible = useMemo(() => {
    return games.filter((game) => {
      if (color !== "all" && game.color !== color) {
        return false;
      }
      if (result !== "all" && game.playerResult !== result) {
        return false;
      }
      return true;
    });
  }, [games, color, result]);

  function openGame(game: PlayerGame, openInNewBoard = false) {
    if (!game.pgn && !game.moves) {
      setStatus(tPanels(locale, "players.noPgn"));
      return;
    }
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
          {playerSource === "lichess" || playerSource === "chesscom" ? (
            <button
              type="button"
              onClick={() => openOpponentPrepPanel({ source: playerSource, username: playerUsername ?? "" })}
              className="shrink-0 font-medium text-studio-accent-text hover:underline"
            >
              {tPrep(prepLocale, "prep.prepareAgainst")}
            </button>
          ) : null}
        </span>
      </div>
      {notice ? (
        <div className="border-b border-studio-border-subtle bg-studio-warning-bg px-3 py-1.5 text-caption text-studio-warning-fg">
          {notice}
        </div>
      ) : null}
      <div className="grid grid-cols-[44px_1fr_44px_1fr_44px_64px] gap-2 border-b border-studio-border-subtle px-3 py-1.5 text-[10px] uppercase tracking-wide text-studio-faint">
        <span>{tPanels(locale, "games.column.result")}</span>
        <span>{tPanels(locale, "games.column.white")}</span>
        <span></span>
        <span>{tPanels(locale, "games.column.black")}</span>
        <span></span>
        <span>{tPanels(locale, "games.column.date")}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto" aria-busy={loading || undefined}>
        {loading ? (
          <div className="px-3 py-4 text-studio-faint" role="status">
            {tPanels(locale, "players.loading")}
          </div>
        ) : null}
        {!loading && visible.length === 0 ? (
          <div className="px-3 py-4 text-studio-faint">{tPanels(locale, "players.empty")}</div>
        ) : null}
        {visible.map((game) => (
          <GameOpenRow
            key={game.id}
            className="grid w-full grid-cols-[44px_1fr_44px_1fr_44px_64px] items-center gap-2 px-3 py-1.5 text-left hover:bg-studio-hover-subtle"
            onOpen={() => openGame(game)}
            onOpenNew={() => openGame(game, true)}
          >
            <ResultMark winner={game.winner} />
            <span className="truncate">{game.whiteName}</span>
            <span className="text-right text-studio-faint">{game.whiteRating ?? ""}</span>
            <span className="truncate">{game.blackName}</span>
            <span className="text-right text-studio-faint">{game.blackRating ?? ""}</span>
            <span className="truncate text-studio-faint">{formatYearMonth(game.year, game.month)}</span>
          </GameOpenRow>
        ))}
      </div>
    </div>
  );
}
