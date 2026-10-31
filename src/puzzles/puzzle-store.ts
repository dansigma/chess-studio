import "server-only";

import { createPublicServerSupabase, createServerSupabase } from "@/src/lib/supabase/server";
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
  /**
   * SIG-1179: when true, read via the `puzzles_unseen` RPC (signed-in caller)
   * so the account's seen ledger is excluded server-side without downloading
   * the id set. The caller's `exclude` (session ids) still applies on top.
   * Falls back to `puzzles_window` when the RPC is unavailable.
   */
  unseen?: boolean;
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
 * seed-stable sampler.
 *
 * SIG-1179: with `options.unseen`, the signed-in caller's seen ledger is
 * excluded server-side via `puzzles_unseen` (same filters, same seed-stable
 * order, plus the anti-join).
 *
 * Return contract:
 * - `null` — the table is unavailable (no client, RPC error, or RPC
 *   unavailable). Callers fall back to the compiled catalog.
 * - `CompiledPuzzle[]` (possibly empty) — the signed-in `puzzles_unseen`
 *   path resolved authoritatively. An empty array means the current window
 *   holds no unseen puzzles: callers widen the window / surface the
 *   exhausted state and must NOT fall back to unfiltered sources, which
 *   would re-serve seen puzzles.
 */
export async function queryPuzzleTable(options: PuzzleTableQuery = {}): Promise<CompiledPuzzle[] | null> {
  const publicClient = createPublicServerSupabase();
  if (!publicClient) {
    return null;
  }
  const args = {
    p_min: options.minRating ?? null,
    p_max: options.maxRating ?? null,
    p_theme: options.theme ?? null,
    p_limit: options.limit ?? 50,
    p_seed: options.seed ?? null,
    p_exclude: options.exclude && options.exclude.length > 0 ? options.exclude : null,
  };
  if (options.unseen) {
    try {
      // Authenticated (cookie-session) client so the RPC's
      // `(select auth.uid())` anti-join sees the caller.
      const authed = await createServerSupabase();
      if (authed) {
        const unseen = await authed.rpc("puzzles_unseen", args);
        if (!unseen.error && unseen.data) {
          // A successful RPC call — even with zero rows — is authoritative:
          // everything in this window is seen. Return the (possibly empty)
          // compiled result so the caller's widening/exhausted logic
          // engages. Never fall through to `puzzles_window` here: it has no
          // seen anti-join and would re-serve the ledger ids just excluded.
          return compileRows(unseen.data);
        }
        // RPC error: fall through to puzzles_window below (best-effort).
      }
      // No authed client: fall through to puzzles_window below.
    } catch {
      // Fall through to puzzles_window below.
    }
  }
  const { data: windowed, error } = await publicClient.rpc("puzzles_window", args);
  if (error || !windowed || windowed.length === 0) {
    return null;
  }
  const compiled = compileRows(windowed);
  return compiled.length > 0 ? compiled : null;
}

function compileRows(
  rows: Array<{ id: string; fen: string; moves: string[]; rating: number; themes: string[] }>,
): CompiledPuzzle[] {
  const compiled: CompiledPuzzle[] = [];
  for (const row of rows) {
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
  return compiled;
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
