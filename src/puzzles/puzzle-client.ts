import { PUZZLE_CATALOG } from "./catalog";
import { compilePuzzle, type CompiledPuzzle } from "./engine";
import type { PuzzleTheme } from "./types";

export interface LoadPuzzleOptions {
  theme?: PuzzleTheme;
  minRating?: number;
  maxRating?: number;
  limit?: number;
  offset?: number;
  exclude?: string[];
  seed?: number;
  sample?: boolean;
}

let fallbackCatalogCache: CompiledPuzzle[] | null = null;

export function getFallbackCatalog(): CompiledPuzzle[] {
  if (!fallbackCatalogCache) {
    fallbackCatalogCache = PUZZLE_CATALOG.map(compilePuzzle);
  }
  return fallbackCatalogCache;
}

// Client-side loader for the compiled puzzle seed. The seed itself lives in
// the server-only `puzzle-data.ts` module; browsers fetch it from
// /api/puzzles so the catalog never ships in a client chunk.
// In offline/guest network failure modes, falls back gracefully to PUZZLE_CATALOG.
export async function loadPuzzleCatalog(
  options?: LoadPuzzleOptions
): Promise<CompiledPuzzle[]> {
  const query = new URLSearchParams();
  if (options?.theme) query.set("theme", options.theme);
  if (options?.minRating !== undefined) query.set("minRating", String(options.minRating));
  if (options?.maxRating !== undefined) query.set("maxRating", String(options.maxRating));
  if (options?.limit !== undefined) query.set("limit", String(options.limit));
  if (options?.offset !== undefined) query.set("offset", String(options.offset));
  if (options?.seed !== undefined) query.set("seed", String(options.seed));
  if (options?.sample) query.set("sample", "true");
  if (options?.exclude && options.exclude.length > 0) {
    query.set("exclude", options.exclude.join(","));
  }

  const qs = query.toString();
  const url = qs ? `/api/puzzles?${qs}` : "/api/puzzles";

  try {
    const response = await fetch(url, { cache: "force-cache" });
    if (!response.ok) {
      throw new Error(`puzzles API ${response.status}`);
    }
    const payload: unknown = await response.json();
    if (!Array.isArray(payload)) {
      throw new Error("puzzles API shape");
    }
    return payload as CompiledPuzzle[];
  } catch (error) {
    // If request failed (offline / network error), provide fallback
    // Filter fallback according to options if specified
    const fallback = getFallbackCatalog();
    if (!options) {
      return fallback;
    }
    return fallback.filter((puzzle) => {
      if (options.theme && !puzzle.themes.includes(options.theme)) return false;
      if (options.minRating !== undefined && puzzle.rating < options.minRating) return false;
      if (options.maxRating !== undefined && puzzle.rating > options.maxRating) return false;
      if (options.exclude && options.exclude.includes(puzzle.id)) return false;
      return true;
    });
  }
}
