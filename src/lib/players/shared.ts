import type { PlayerGame, PlayerSource } from "@/src/lib/player-types";

export const MAX_PLAYER_GAMES = 80;
export const MAX_PLAYER_GAMES_BYTES = 2 * 1024 * 1024; // 2 MB
export const GAMES_CACHE_TTL_MS = 180_000;
export const SEARCH_TIMEOUT_MS = 6_000;
export const GAMES_TIMEOUT_MS = 15_000;

export const UA = "StudioClone/0.1 (chess analysis; local development)";

export function fetchTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
}

export function safeQuery(value: string): string {
  return value.replace(/[%_,()"]/g, " ").trim().slice(0, 48);
}

export function playerResult(
  winner: PlayerGame["winner"],
  color: "white" | "black",
): PlayerGame["playerResult"] {
  if (winner === "draw") {
    return "draw";
  }
  if (winner === "white" || winner === "black") {
    return winner === color ? "win" : "loss";
  }
  return null;
}

export function isSource(value: string): value is PlayerSource {
  return value === "lichess" || value === "chesscom" || value === "studio";
}
