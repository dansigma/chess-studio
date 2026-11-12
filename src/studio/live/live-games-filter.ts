// SIG-1297: All / Ongoing / Finished filter of the round's games table. Based on the result, not the clock
// (some ongoing games have no clock).
import type { LiveGame } from "@/src/lib/live/types";

export type GamesFilter = "all" | "ongoing" | "finished";
export const GAMES_FILTERS: readonly GamesFilter[] = ["all", "ongoing", "finished"];

export function filterGames(rows: readonly LiveGame[], filter: GamesFilter): LiveGame[] {
  if (filter === "all") {
    return rows.slice();
  }
  const ongoing = filter === "ongoing";
  return rows.filter((g) => (g.result === "*") === ongoing);
}

export function countGames(rows: readonly LiveGame[]): Record<GamesFilter, number> {
  const ongoing = rows.reduce((n, g) => n + (g.result === "*" ? 1 : 0), 0);
  return { all: rows.length, ongoing, finished: rows.length - ongoing };
}
