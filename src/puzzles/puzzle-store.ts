import "server-only";

import { createPublicServerSupabase } from "@/src/lib/supabase/server";
import { compilePuzzle, type CompiledPuzzle } from "./engine";
import { isPuzzleTheme } from "./query";
import type { Puzzle } from "./types";

export interface PuzzleTableQuery {
  minRating?: number;
  maxRating?: number;
  theme?: string;
  limit?: number;
  seed?: number;
  exclude?: string[];
}

let warnedCompileFailure = false;

function warnCompileOnce(message: string): void {
  if (warnedCompileFailure) {
    return;
  }
  warnedCompileFailure = true;
  console.warn(`[puzzles] ${message}`);
}

/**
 * SIG-1102: read puzzles from `public.puzzles` via the `puzzles_window`
 * seed-stable sampler. Returns `null` when the table is empty or the client
 * is unavailable so callers fall back to the compiled catalog.
 */
export async function queryPuzzleTable(options: PuzzleTableQuery = {}): Promise<CompiledPuzzle[] | null> {
  const supabase = createPublicServerSupabase();
  if (!supabase) {
    return null;
  }
  const { data, error } = await supabase.rpc("puzzles_window", {
    p_min: options.minRating ?? null,
    p_max: options.maxRating ?? null,
    p_theme: options.theme ?? null,
    p_limit: options.limit ?? 50,
    p_seed: options.seed ?? null,
    p_exclude: options.exclude && options.exclude.length > 0 ? options.exclude : null,
  });
  if (error || !data || data.length === 0) {
    return null;
  }
  const compiled: CompiledPuzzle[] = [];
  for (const row of data) {
    const themes = Array.isArray(row.themes) ? row.themes.filter(isPuzzleTheme) : [];
    if (themes.length === 0) {
      warnCompileOnce(`skipping row ${row.id} with no known themes`);
      continue;
    }
    try {
      compiled.push(
        compilePuzzle({
          id: row.id,
          fen: row.fen,
          moves: row.moves,
          rating: row.rating,
          themes,
        }),
      );
    } catch {
      warnCompileOnce(`skipping row ${row.id} that failed to compile`);
    }
  }
  return compiled.length > 0 ? compiled : null;
}

/** Single-row lookup for `?id=`; `null` means "try the catalog". */
export async function fetchPuzzleRowById(id: string): Promise<Puzzle | null> {
  const supabase = createPublicServerSupabase();
  if (!supabase) {
    return null;
  }
  const { data, error } = await supabase
    .from("puzzles")
    .select("id,fen,moves,rating,themes,popularity,nb_plays")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) {
    return null;
  }
  const themes = Array.isArray(data.themes) ? data.themes.filter(isPuzzleTheme) : [];
  if (themes.length === 0) {
    return null;
  }
  return {
    id: data.id,
    fen: data.fen,
    moves: data.moves,
    rating: data.rating,
    themes,
  };
}
