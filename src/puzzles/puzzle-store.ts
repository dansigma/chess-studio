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
let warnedEmptyTable = false;

function warnEmptyTableOnce(): void {
  if (warnedEmptyTable) {
    return;
  }
  warnedEmptyTable = true;
  console.warn(
    "[puzzles] puzzles_unseen returned no rows and puzzles_window has none for the same window: " +
      "public.puzzles looks empty/unloaded (see docs/puzzles.md). Falling back to the built-in catalog.",
  );
}

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
 *   path resolved authoritatively. An empty array means the window HAS
 *   puzzles but the caller has seen them all: callers widen the window /
 *   surface the exhausted state and must NOT fall back to unfiltered
 *   sources, which would re-serve seen puzzles.
 *
 * SIG-1243: an empty `puzzles_unseen` result is only trusted as "all seen"
 * after a probe of `puzzles_window` (same window, no exclude) finds rows. If
 * the window has no rows at all the table is empty/unloaded, so this returns
 * `null` and the route serves the built-in catalog, as for anonymous users.
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
          // A non-empty result is authoritative. An empty one means "all seen"
          // only if the window has rows (probe below). Never fall through to `puzzles_window` here: it has no
          // seen anti-join and would re-serve the ledger ids just excluded.
          if (unseen.data.length > 0) {
            return compileRows(unseen.data);
          }
          // SIG-1243: zero unseen rows is ambiguous — "all seen" or "table
          // empty". Probe the same window without the seen/exclude filters.
          const probe = await publicClient.rpc("puzzles_window", {
            ...args,
            p_limit: 1,
            p_seed: null,
            p_exclude: null,
          });
          if (probe.error) {
            // Cannot tell the cases apart; a repeat-prone catalog beats a
            // false "you solved everything".
            return null;
          }
          if (probe.data && probe.data.length > 0) {
            return [];
          }
          warnEmptyTableOnce();
          return null;
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
