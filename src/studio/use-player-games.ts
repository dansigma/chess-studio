"use client";

import { useEffect, useState } from "react";
import { tPanels } from "@/src/i18n/studio-panel-strings";
import type { PlayerGame, PlayerGamesResponse, PlayerHit } from "@/src/lib/player-types";
import { useStudioStore } from "@/src/store/studio-store";

const requests = new Map<string, { promise: Promise<PlayerGamesResponse>; expiresAt: number }>();
const CACHE_MS = 60_000;
const EMPTY_GAMES: PlayerGame[] = [];

export function loadStudioPlayerGames(player: PlayerHit, userId: string | null = null): Promise<PlayerGamesResponse> {
  const now = Date.now();
  for (const [id, entry] of requests) {
    if (entry.expiresAt <= now) requests.delete(id);
  }
  const key = JSON.stringify([player.id, player.source === "studio" ? userId : null]);
  const cached = requests.get(key);
  if (cached) return cached.promise;

  const { source, username, displayName, subtitle } = player;
  const query = new URLSearchParams({ source, username, displayName, subtitle });
  const promise = fetch(`/api/players/games?${query}`).then(async (response) => {
    if (!response.ok) throw new Error("Could not load games");
    return (await response.json()) as PlayerGamesResponse;
  });
  const entry = { promise, expiresAt: Infinity };
  requests.set(key, entry);
  void promise.then(
    (payload) => {
      if (source === "studio" || payload.partial) requests.delete(key);
      else entry.expiresAt = Date.now() + CACHE_MS;
    },
    () => { requests.delete(key); },
  );
  return promise;
}

export function usePlayerGames(player: PlayerHit | null) {
  const [settled, setSettled] = useState<{
    id: string;
    userId: string | null;
    payload: PlayerGamesResponse | null;
  } | null>(null);
  const locale = useStudioStore((state) => state.settings.locale);
  const userId = useStudioStore((state) => player?.source === "studio" ? state.user?.id ?? null : null);
  const id = player?.id;
  const source = player?.source;
  const username = player?.username;
  const displayName = player?.displayName;
  const subtitle = player?.subtitle;

  useEffect(() => {
    if (!id || !source || !username || displayName === undefined || subtitle === undefined) return;
    let active = true;
    void loadStudioPlayerGames({ id, source, username, displayName, subtitle }, userId).then(
      (payload) => { if (active) setSettled({ id, userId, payload }); },
      () => { if (active) setSettled({ id, userId, payload: null }); },
    );
    return () => { active = false; };
  }, [id, source, username, displayName, subtitle, userId]);

  const current = id && settled?.id === id && settled.userId === userId ? settled : null;
  return {
    games: current?.payload?.games ?? EMPTY_GAMES,
    loading: Boolean(id && !current),
    notice: current && !current.payload
      ? tPanels(locale, "players.loadError")
      : current?.payload?.notice ?? null,
  };
}

// Keep the sidebar-driven Chess.com explorer supplied with the active player's games.
export function useLegacyPlayerGames(player: PlayerHit | null) {
  const data = usePlayerGames(player);
  const { games, loading, notice } = data;
  const id = player?.id;
  useEffect(() => {
    const state = useStudioStore.getState();
    if (id && state.playerProfile?.id === id) {
      if (loading) state.setPlayerGamesLoading(true);
      else state.setPlayerGames(games, notice);
    }
  }, [id, games, loading, notice]);
  return data;
}
