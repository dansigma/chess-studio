// SIG-1089: paged client-side read of `public.my_games` (My Games 3/5).
// Client param is `SupabaseClient<Database>` (same grain as
// `src/lib/my-games/linked-accounts.ts`); tests cast a hand-rolled fake.
// Pagination is offset-based (`{ limit, offset }`), not a `played_at`
// keyset: `played_at` is nullable, and Postgres sorts nulls first on
// `desc`, so any `lt(played_at)` cursor strands rows once a null-timestamp
// row appears. Offset pagination with a stable order
// (`played_at desc nulls last, id asc`) keeps every row reachable without
// a second synchronized index.
// `myGamesRowToPlayerGame` is the documented inverse of `playerGameToRow`
// (`game-row.ts`): `event`/`moves` are lossy by schema design (my_games has
// no event column and stores only `ply_count`), so they come back as
// `null`/`undefined` — both shapes `importPlayerGame` already accepts.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlayerGame } from "@/src/lib/player-types";
import type { Database, Json } from "@/src/lib/supabase/database.types";
import type { MistakeCounts, MistakeTier } from "./review-queue";
import type { GamePhase } from "@/src/chess/phases";

export type MyGamesRow = Database["public"]["Tables"]["my_games"]["Row"];

export const MY_GAMES_PAGE_SIZE = 50;

export type MyGamesPage = {
  games: PlayerGame[];
  hasMore: boolean;
  /** Offset of the next page; `null` when there is no next page. */
  cursor: string | null;
};

export type LoadMyGamesError = "unavailable" | "signed_out";

export type LoadMyGamesResult =
  | { ok: true; page: MyGamesPage }
  | { ok: false; error: LoadMyGamesError };

function playedAtMs(playedAt: string | null): number | null {
  if (!playedAt) {
    return null;
  }
  const ms = Date.parse(playedAt);
  return Number.isNaN(ms) ? null : ms;
}

const MISTAKE_PHASES: readonly GamePhase[] = ["opening", "middlegame", "endgame"];
const MISTAKE_TIERS: readonly MistakeTier[] = ["inaccuracy", "mistake", "miss", "blunder"];

/** SIG-1091: validates `my_games.mistake_counts` JSON into `MistakeCounts`.
 * Fail-closed: any malformed fragment yields `null` (never fabricated counts).
 * Unknown extra keys are ignored. */
function toMistakeCounts(value: Json | null): MistakeCounts | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, Json | undefined>;
  const out = {} as MistakeCounts;
  for (const phase of MISTAKE_PHASES) {
    const phaseValue = record[phase];
    if (phaseValue == null || typeof phaseValue !== "object" || Array.isArray(phaseValue)) {
      return null;
    }
    const tiers = phaseValue as Record<string, Json | undefined>;
    const counts = {} as Record<MistakeTier, number>;
    for (const tier of MISTAKE_TIERS) {
      const count = tiers[tier];
      if (typeof count !== "number" || !Number.isFinite(count) || count < 0) {
        return null;
      }
      counts[tier] = count;
    }
    out[phase] = counts;
  }
  return out;
}

export function myGamesRowToPlayerGame(row: MyGamesRow): PlayerGame | null {
  const pgn = row.pgn?.trim() ? row.pgn : "";
  if (!row.external_id || !pgn) {
    return null;
  }
  // The column is nullable (`check in ('white','black')`); a stored row is
  // never unopenable, so default to "white" rather than skipping the game.
  const color: "white" | "black" = row.color ?? "white";
  const playerResult = row.result;
  const winner =
    playerResult === "win"
      ? color
      : playerResult === "loss"
        ? color === "white"
          ? "black"
          : "white"
        : playerResult === "draw"
          ? "draw"
          : null;
  const playedAt = playedAtMs(row.played_at);
  const date = playedAt === null ? null : new Date(playedAt);
  return {
    id: row.external_id,
    // The row id is the batch-review write-back key (see PlayerGame.rowId).
    rowId: row.id,
    winner,
    whiteName: row.white ?? "?",
    whiteRating: row.white_elo,
    blackName: row.black ?? "?",
    blackRating: row.black_elo,
    year: date ? date.getUTCFullYear() : null,
    month: date ? date.getUTCMonth() + 1 : null,
    event: null,
    eco: row.eco,
    opening: row.opening,
    pgn,
    moves: undefined,
    timeClass: row.time_class,
    color,
    playerResult,
    playedAt,
    userAccuracy: row.user_accuracy ?? null,
    opponentAccuracy: row.opponent_accuracy ?? null,
    reviewedAt: row.reviewed_at ?? null,
    mistakeCounts: toMistakeCounts(row.mistake_counts),
  };
}

function parseCursor(cursor: string | null | undefined): number | null {
  if (cursor === null || cursor === undefined || cursor === "") {
    return 0;
  }
  const offset = Number(cursor);
  if (!Number.isInteger(offset) || offset < 0) {
    return null;
  }
  return offset;
}

export async function loadMyGames(
  client: SupabaseClient<Database>,
  { limit = MY_GAMES_PAGE_SIZE, before }: { limit?: number; before?: string | null } = {},
): Promise<LoadMyGamesResult> {
  const offset = parseCursor(before);
  if (offset === null) {
    return { ok: false, error: "unavailable" };
  }
  const { data: authData, error: authError } = await client.auth.getUser();
  const userId = authError ? null : (authData.user?.id ?? null);
  if (!userId) {
    return { ok: false, error: "signed_out" };
  }
  // Stable order: newest first, null timestamps last, row id as tiebreaker
  // (nulls never strand a page, duplicate timestamps never reorder rows).
  const query = client
    .from("my_games")
    .select("*")
    .order("played_at", { ascending: false, nullsFirst: false })
    .order("id", { ascending: true });
  const { data, error } = await query.range(offset, offset + limit);
  if (error || !data) {
    return { ok: false, error: "unavailable" };
  }
  const rows = data as MyGamesRow[];
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const games = pageRows
    .map((row) => myGamesRowToPlayerGame(row))
    .filter((game): game is PlayerGame => game !== null);
  return {
    ok: true,
    page: { games, hasMore, cursor: hasMore ? String(offset + limit) : null },
  };
}
