// SIG-1090: pure selection helpers for the My Games batch-review UI.
// Which rows are reviewable (a loaded row with a PGN and a row id) and which
// are still unreviewed; kept dependency-free (same grain as `view-state.ts`)
// so `node:test` suites can import it without touching `.tsx`.
import type { PlayerGame } from "@/src/lib/player-types";

export function isReviewableGame(game: PlayerGame): boolean {
  return game.rowId != null && Boolean(game.pgn?.trim());
}

/** Selected row ids, restricted to reviewable games (stale ids dropped). */
export function reviewableSelection(games: PlayerGame[], selected: ReadonlySet<string>): PlayerGame[] {
  const wanted = new Set(selected);
  return games.filter((game) => game.rowId != null && wanted.has(game.rowId) && isReviewableGame(game));
}

/** Unreviewed reviewable games, newest first (loader order preserved). */
export function unreviewedReviewableGames(games: PlayerGame[]): PlayerGame[] {
  return games.filter((game) => isReviewableGame(game) && game.reviewedAt == null);
}
