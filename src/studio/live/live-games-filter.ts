// SIG-1297: All / Ongoing / Finished filter of the round's games table. Based on the result, not the clock
// (some ongoing games have no clock). SIG-1311: player search, rating sort and short names for the same table.
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

/** Lowercase and accent-free, so "José" and "jose" match. */
export function normalizeSearch(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/** Games whose White or Black name contains the query (case and accent-insensitive); blank query keeps all. */
export function searchGames(rows: readonly LiveGame[], query: string): LiveGame[] {
  const needle = normalizeSearch(query).trim();
  if (needle === "") {
    return rows.slice();
  }
  return rows.filter(
    (g) => normalizeSearch(g.white.name).includes(needle) || normalizeSearch(g.black.name).includes(needle),
  );
}

export type GamesSort = "board" | "rating";
export const GAMES_SORTS: readonly GamesSort[] = ["board", "rating"];

/** The higher of the two ratings; null when neither player has one. */
export function topRating(game: LiveGame): number | null {
  const ratings = [game.white.rating, game.black.rating].filter((r): r is number => typeof r === "number");
  return ratings.length === 0 ? null : Math.max(...ratings);
}

/** "board" keeps the order given (Lichess' board order); "rating" is highest rating first, unrated last, ties in board order. */
export function sortGames(rows: readonly LiveGame[], sort: GamesSort): LiveGame[] {
  if (sort === "board") {
    return rows.slice();
  }
  return rows
    .map((game, index) => ({ game, index, rating: topRating(game) }))
    .sort((a, b) => {
      if (a.rating === b.rating) {
        return a.index - b.index;
      }
      if (a.rating === null) {
        return 1;
      }
      if (b.rating === null) {
        return -1;
      }
      return b.rating - a.rating || a.index - b.index;
    })
    .map((entry) => entry.game);
}

/** Lichess sends "Surname, Firstname": shown as "F. Surname". A name without a comma is unchanged. */
export function shortPlayerName(name: string): string {
  const comma = name.indexOf(",");
  if (comma === -1) {
    return name;
  }
  const surname = name.slice(0, comma).trim();
  const initial = Array.from(name.slice(comma + 1).trim())[0];
  if (surname === "") {
    return name;
  }
  return initial ? `${initial.toUpperCase()}. ${surname}` : surname;
}

/** Whether a key press comes from somewhere the user is typing (so "/" must not steal it). */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as { tagName?: string; isContentEditable?: boolean } | null;
  if (!el || typeof el.tagName !== "string") {
    return false;
  }
  const tag = el.tagName.toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable === true;
}
