import { positionKey } from "@/src/chess/zobrist";
import type { ExplorerFilters } from "@/src/lib/explorer-filters";
import type { ExplorerGameRow, ExplorerResponse, ExplorerSource } from "@/src/lib/explorer-types";
import {
  emptyExplorer,
  lookupBookGames,
  lookupBookOpening,
  lookupOpeningBook,
} from "@/src/lib/opening-book";

export type IndexLookupProvider = (fen: string, source?: ExplorerSource) => ExplorerResponse | null;

let activeIndexProvider: IndexLookupProvider | null = null;

export function registerIndexProvider(provider: IndexLookupProvider | null): void {
  activeIndexProvider = provider;
}

function normalizeFen(fen: string): string {
  return fen.trim().split(/\s+/).slice(0, 4).join(" ");
}

function filterGames(
  games: ExplorerGameRow[],
  filters?: ExplorerFilters,
): ExplorerGameRow[] {
  if (!filters) {
    return games;
  }
  return games.filter((game) => {
    if (game.speed && !filters.speeds.includes(game.speed)) {
      return false;
    }
    if (filters.minRating > 0) {
      const highest = Math.max(game.whiteRating ?? 0, game.blackRating ?? 0);
      if (highest < filters.minRating) {
        return false;
      }
    }
    if (filters.sinceYear != null && (game.year == null || game.year < filters.sinceYear)) {
      return false;
    }
    if (filters.untilYear != null && (game.year == null || game.year > filters.untilYear)) {
      return false;
    }
    return true;
  });
}

/**
 * Returns the canonical 64-bit FNV-1a position key for offline index lookups.
 */
export function getCuratedPositionKey(fen: string): bigint {
  return positionKey(fen);
}

/**
 * Pre-warms the in-memory opening book and index cache so subsequent lookups
 * execute in sub-millisecond time.
 */
export function warmCuratedIndex(): void {
  lookupOpeningBook("curated", "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -");
}

/**
 * Embedded query engine for the offline curated master database.
 * Resolves positions in sub-50ms by checking:
 * 1. The local SQLite index (if registered / present on disk).
 * 2. The embedded curated master opening book.
 * 3. Graceful empty explorer payload fallback.
 */
export function lookupCuratedIndex(
  fen: string,
  filters?: ExplorerFilters,
  customProvider?: IndexLookupProvider | null,
): ExplorerResponse {
  const normalized = normalizeFen(fen);

  // 1. Try local SQLite opening index via provider (server-side only)
  const provider = customProvider !== undefined ? customProvider : activeIndexProvider;
  const indexed = provider ? provider(normalized, "curated") : null;
  if (indexed && indexed.moves.length > 0) {
    const rawGames = lookupBookGames(normalized);
    const opening = lookupBookOpening(normalized);
    const games = filterGames(rawGames, filters);
    return {
      source: "curated",
      fen: normalized,
      white: indexed.white,
      draws: indexed.draws,
      black: indexed.black,
      opening: indexed.opening ?? opening,
      moves: indexed.moves,
      games,
    };
  }

  // 2. Fall back to embedded curated opening book
  const book = lookupOpeningBook("curated", normalized);
  if (book) {
    const filteredGames = filterGames(book.games, filters);
    return {
      ...book,
      source: "curated",
      games: filteredGames,
    };
  }

  // 3. Fallback to empty response
  return emptyExplorer(
    "curated",
    normalized,
    "No curated master games found for this position.",
  );
}
