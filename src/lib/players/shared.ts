import type { PlayerGame, PlayerSource } from "@/src/lib/player-types";

export const MAX_PLAYER_GAMES = 80;
export const MAX_PLAYER_GAMES_BYTES = 2 * 1024 * 1024; // 2 MB
export const GAMES_CACHE_TTL_MS = 180_000;
export const SEARCH_TIMEOUT_MS = 6_000;
export const GAMES_TIMEOUT_MS = 15_000;

export const UA = "StudioClone/0.1 (chess analysis; local development)";

export function lichessToken(): string | undefined {
  return process.env.LICHESS_TOKEN ?? process.env.LICHESS_API_TOKEN;
}

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

// Thrown when the upstream provider reports the account has no public games
// (unknown username or no games). Routes map this to 404; every other loader
// failure stays a 502.
export class NoPublicGamesError extends Error {
  constructor(message = "No public games found for this account") {
    super(message);
    this.name = "NoPublicGamesError";
  }
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  if (items.length === 0) {
    return results;
  }
  const workers = Math.max(1, Math.min(limit < 1 ? 1 : limit, items.length));
  let next = 0;
  async function run(): Promise<void> {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await fn(items[index] as T, index);
    }
  }
  await Promise.all(Array.from({ length: workers }, () => run()));
  return results;
}
