// SIG-1275: position search over `my_game_positions` for the Library's My
// Games adapter (SIG-1272 wires `capabilities().position = "full"` to this).
import type { SupabaseClient } from "@supabase/supabase-js";
import { positionKey } from "@/src/chess/zobrist";
import type { Database } from "@/src/lib/supabase/database.types";

export type MyGamesPositionFilters = {
  color?: "white" | "black" | null;
  result?: "win" | "loss" | "draw" | null;
  opponent?: string | null;
  query?: string | null;
};

/** Ids of the caller's My Games that reach `fen`, honoring the other filters. */
export async function searchMyGameIdsAtPosition(
  client: SupabaseClient<Database>,
  fen: string,
  filters: MyGamesPositionFilters = {},
): Promise<{ ok: true; ids: string[] } | { ok: false; error: string }> {
  const { data, error } = await client.rpc("my_games_at_position", {
    p_zkey: positionKey(fen).toString(),
    p_color: filters.color ?? null,
    p_result: filters.result ?? null,
    p_opponent: filters.opponent?.trim() || null,
    p_query: filters.query?.trim() || null,
  });
  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true, ids: (data ?? []).map((row) => row.id) };
}

/** Number of the caller's games still waiting for the position index. */
export async function countUnindexedMyGames(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<number | null> {
  const { count, error } = await client
    .from("my_games")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("indexed_at", null);
  return error ? null : (count ?? 0);
}
