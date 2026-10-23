// SIG-1089: paged client-side read of `public.my_games` (My Games 3/5).
// Client param is `SupabaseClient<Database>` (same grain as
// `src/lib/my-games/linked-accounts.ts`); tests cast a hand-rolled fake.
// `myGamesRowToPlayerGame` is the documented inverse of `playerGameToRow`
// (`game-row.ts`): `event`/`moves` are lossy by schema design (my_games has
// no event column and stores only `ply_count`), so they come back as
// `null`/`undefined` — both shapes `importPlayerGame` already accepts.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlayerGame } from "@/src/lib/player-types";
import type { Database } from "@/src/lib/supabase/database.types";

export type MyGamesRow = Database["public"]["Tables"]["my_games"]["Row"];

export const MY_GAMES_PAGE_SIZE = 50;

export type MyGamesPage = {
  games: PlayerGame[];
  hasMore: boolean;
  /** `played_at` of the last row in the page; `null` when there is no next page. */
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
  };
}

export async function loadMyGames(
  client: SupabaseClient<Database>,
  { limit = MY_GAMES_PAGE_SIZE, before }: { limit?: number; before?: string | null } = {},
): Promise<LoadMyGamesResult> {
  const { data: authData, error: authError } = await client.auth.getUser();
  const userId = authError ? null : (authData.user?.id ?? null);
  if (!userId) {
    return { ok: false, error: "signed_out" };
  }
  let query = client.from("my_games").select("*").order("played_at", { ascending: false });
  if (before) {
    query = query.lt("played_at", before);
  }
  const { data, error } = await query.limit(limit + 1);
  if (error || !data) {
    return { ok: false, error: "unavailable" };
  }
  const rows = data as MyGamesRow[];
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const games = pageRows
    .map((row) => myGamesRowToPlayerGame(row))
    .filter((game): game is PlayerGame => game !== null);
  // `played_at` is nullable: when the whole page lacks timestamps there is no
  // usable cursor, so terminate pagination (`cursor: null`) instead of issuing
  // a `lt(null)` query that would loop forever.
  const lastPlayedAt = pageRows.length > 0 ? (pageRows[pageRows.length - 1]?.played_at ?? null) : null;
  return {
    ok: true,
    page: { games, hasMore: hasMore && lastPlayedAt !== null, cursor: hasMore ? lastPlayedAt : null },
  };
}
