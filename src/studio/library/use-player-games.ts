"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { PlayerGame, PlayerGamesResponse, PlayerHit } from "@/src/lib/player-types";
import { localPlayerGames } from "@/src/lib/players/local-files";
import { useStudioStore } from "@/src/store/studio-store";

export type PlayerGamesState = {
  games: PlayerGame[];
  loading: boolean;
  /** Set when the games could not be loaded; `retry` runs the request again. */
  error: string | null;
  /** Loaded fine, but the player has no games. */
  noGames: boolean;
  /** The source returned only part of the player's games (a cap was hit). */
  truncated: boolean;
  /** Some upstream months were skipped or cut short. */
  partial: boolean;
  notice: string | null;
  /**
   * The games come from the PGN files loaded in this browser. Only these
   * players can be listed in the Library's Games tab, and only the others can
   * be opened by the Studio's player panels (they load through the API).
   */
  fromLoadedFiles: boolean;
  retry: () => void;
};

type Remote = {
  key: string;
  games: PlayerGame[];
  truncated: boolean;
  partial: boolean;
  notice: string | null;
  error: string | null;
};

const NO_GAMES: PlayerGame[] = [];

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

/**
 * SIG-1333: one hook for the games of any player, in the `PlayerGame` shape.
 * A `studio` player found in the loaded PGN files is read from memory (all
 * games, no request); every other player goes through `/api/players/games`
 * (Lichess, Chess.com, sample-book players). The request is aborted when the
 * player changes.
 */
export function usePlayerGames(player: PlayerHit | null): PlayerGamesState {
  const databases = useStudioStore((state) => state.files.databases);
  const [remote, setRemote] = useState<Remote | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const id = player?.id ?? null;
  const source = player?.source ?? null;
  const username = player?.username ?? null;
  const displayName = player?.displayName ?? null;
  const subtitle = player?.subtitle ?? null;

  const local = useMemo(
    () => (source === "studio" && username ? localPlayerGames(databases, username) : NO_GAMES),
    [databases, source, username],
  );
  const useLocal = local.length > 0;

  const key =
    id !== null && source !== null && username !== null && !useLocal
      ? JSON.stringify([reloadToken, id, source, username, displayName, subtitle])
      : null;

  useEffect(() => {
    if (key === null || source === null || username === null) {
      return;
    }
    const controller = new AbortController();
    const params = new URLSearchParams({
      source,
      username,
      displayName: displayName ?? username,
      subtitle: subtitle ?? "",
    });
    fetch(`/api/players/games?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Could not load games");
        }
        return (await response.json()) as PlayerGamesResponse;
      })
      .then((payload) => {
        if (controller.signal.aborted) {
          return;
        }
        setRemote({
          key,
          games: payload.games ?? NO_GAMES,
          truncated: payload.truncated === true,
          partial: payload.partial === true,
          notice: payload.notice ?? null,
          error: null,
        });
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted || isAbort(cause)) {
          return;
        }
        setRemote({
          key,
          games: NO_GAMES,
          truncated: false,
          partial: false,
          notice: null,
          error: cause instanceof Error ? cause.message : "Could not load games",
        });
      });
    return () => controller.abort();
  }, [key, source, username, displayName, subtitle]);

  const retry = useCallback(() => setReloadToken((n) => n + 1), []);

  if (useLocal) {
    return {
      games: local,
      loading: false,
      error: null,
      noGames: false,
      truncated: false,
      partial: false,
      notice: null,
      fromLoadedFiles: true,
      retry,
    };
  }
  if (key === null) {
    return { games: NO_GAMES, loading: false, error: null, noGames: false, truncated: false, partial: false, notice: null, fromLoadedFiles: false, retry };
  }
  if (remote?.key !== key) {
    return { games: NO_GAMES, loading: true, error: null, noGames: false, truncated: false, partial: false, notice: null, fromLoadedFiles: false, retry };
  }
  return {
    games: remote.games,
    loading: false,
    error: remote.error,
    noGames: remote.error === null && remote.games.length === 0,
    truncated: remote.truncated,
    partial: remote.partial,
    notice: remote.notice,
    fromLoadedFiles: false,
    retry,
  };
}
