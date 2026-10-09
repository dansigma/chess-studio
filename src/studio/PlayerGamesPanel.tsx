"use client";

import { useEffect, useMemo } from "react";
import { formatYearMonth } from "@/src/lib/game-date";
import type { PlayerGame, PlayerGamesResponse } from "@/src/lib/player-types";
import { useStudioStore } from "@/src/store/studio-store";
import { ResultMark } from "./ResultMark";

export function PlayerGamesPanel() {
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

  function openGame(game: PlayerGame) {
    if (!game.pgn && !game.moves) {
      setStatus("No PGN available for that game.");
      return;
    }
    importPlayerGame(game);
    setStatus(null);
  }

  if (!player) {
    return (
      <div className="flex h-full items-center justify-center bg-studio-panel text-sm text-studio-faint">
        Search a player to load their games.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-studio-panel text-dense text-studio-fg">
      <div className="flex items-center justify-between border-b border-studio-border-subtle px-3 py-2 text-caption text-studio-faint">
        <span className="truncate">Games: {player.displayName}</span>
        <span>
          {visible.length} game{visible.length === 1 ? "" : "s"}
          {notice ? " · recent first" : ""}
        </span>
      </div>
      {notice ? (
        <div className="border-b border-studio-border-subtle bg-studio-warning-bg px-3 py-1.5 text-caption text-studio-warning-fg">
          {notice}
        </div>
      ) : null}
      <div className="grid grid-cols-[44px_1fr_44px_1fr_44px_64px] gap-2 border-b border-studio-border-subtle px-3 py-1.5 text-[10px] uppercase tracking-wide text-studio-faint">
        <span>Res.</span>
        <span>White</span>
        <span></span>
        <span>Black</span>
        <span></span>
        <span>Date</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto" aria-busy={loading || undefined}>
        {loading ? (
          <div className="px-3 py-4 text-studio-faint" role="status">
            Loading games…
          </div>
        ) : null}
        {!loading && visible.length === 0 ? (
          <div className="px-3 py-4 text-studio-faint">No games for this player.</div>
        ) : null}
        {visible.map((game) => (
          <button
            key={game.id}
            className="grid w-full grid-cols-[44px_1fr_44px_1fr_44px_64px] items-center gap-2 px-3 py-1.5 text-left hover:bg-studio-hover-subtle"
            onClick={() => openGame(game)}
          >
            <ResultMark winner={game.winner} />
            <span className="truncate">{game.whiteName}</span>
            <span className="text-right text-studio-faint">{game.whiteRating ?? ""}</span>
            <span className="truncate">{game.blackName}</span>
            <span className="text-right text-studio-faint">{game.blackRating ?? ""}</span>
            <span className="truncate text-studio-faint">{formatYearMonth(game.year, game.month)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
