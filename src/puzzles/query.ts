import type { CompiledPuzzle } from "./engine";
import { PUZZLE_THEMES, type PuzzleTheme } from "./types";

export interface PuzzleQueryOptions {
  theme?: PuzzleTheme;
  minRating?: number;
  maxRating?: number;
  limit?: number;
  offset?: number;
  exclude?: string[] | Set<string>;
  seed?: number;
  sample?: boolean;
}

export interface PuzzleQueryResult {
  items: CompiledPuzzle[];
  total: number;
}

function mulberry32(a: number) {
  let s = a >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleWithSeed<T>(arr: T[], seed: number): T[] {
  const result = [...arr];
  const rng = mulberry32(seed);
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = result[i]!;
    result[i] = result[j]!;
    result[j] = tmp;
  }
  return result;
}

export function isPuzzleTheme(value: unknown): value is PuzzleTheme {
  return typeof value === "string" && PUZZLE_THEMES.includes(value as PuzzleTheme);
}

export function queryPuzzles(
  pool: readonly CompiledPuzzle[],
  options: PuzzleQueryOptions = {}
): PuzzleQueryResult {
  const { theme, minRating, maxRating, limit, offset = 0, exclude, seed, sample } = options;

  if (theme !== undefined && !isPuzzleTheme(theme)) {
    throw new Error(`Invalid theme: "${theme}"`);
  }
  if (minRating !== undefined && (!Number.isFinite(minRating) || minRating < 0)) {
    throw new Error(`Invalid minRating: "${minRating}"`);
  }
  if (maxRating !== undefined && (!Number.isFinite(maxRating) || maxRating < 0)) {
    throw new Error(`Invalid maxRating: "${maxRating}"`);
  }
  if (
    minRating !== undefined &&
    maxRating !== undefined &&
    minRating > maxRating
  ) {
    throw new Error(`minRating (${minRating}) cannot exceed maxRating (${maxRating})`);
  }
  if (limit !== undefined && (!Number.isFinite(limit) || limit <= 0)) {
    throw new Error(`Invalid limit: "${limit}"`);
  }
  if (offset !== undefined && (!Number.isFinite(offset) || offset < 0)) {
    throw new Error(`Invalid offset: "${offset}"`);
  }

  const excludeSet = exclude
    ? exclude instanceof Set
      ? exclude
      : new Set(exclude)
    : null;

  let filtered = pool.filter((puzzle) => {
    if (theme && !puzzle.themes.includes(theme)) {
      return false;
    }
    if (minRating !== undefined && puzzle.rating < minRating) {
      return false;
    }
    if (maxRating !== undefined && puzzle.rating > maxRating) {
      return false;
    }
    if (excludeSet && excludeSet.has(puzzle.id)) {
      return false;
    }
    return true;
  });

  const total = filtered.length;

  if (seed !== undefined) {
    filtered = shuffleWithSeed(filtered, seed);
  } else if (sample) {
    // Ephemeral non-deterministic shuffle if sample flag requested without seed
    const randomSeed = (Math.random() * 0xffffffff) >>> 0;
    filtered = shuffleWithSeed(filtered, randomSeed);
  }

  const start = Math.max(0, Math.floor(offset));
  const end = limit !== undefined ? start + Math.floor(limit) : undefined;
  const items = filtered.slice(start, end);

  return { items, total };
}
