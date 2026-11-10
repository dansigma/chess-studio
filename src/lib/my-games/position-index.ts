// SIG-1275: position index for My Games. Reuses `rowsForTree` and
// `positionKey` (no new hasher): the rows written here have the same zkey as
// `game_positions` for imported PGNs, so the same FEN reaches the same key.
// Writes use the service client; indexing is best effort and must never throw
// into callers (sync keeps working, the backfill retries unindexed games).
import type { SupabaseClient } from "@supabase/supabase-js";
import { importPgn } from "@/src/chess/pgn";
import { rowsForTree } from "@/src/lib/position-index";
import type { Database } from "@/src/lib/supabase/database.types";

export const MAX_POSITIONS_PER_GAME = 1200;
export const INDEX_CHUNK_SIZE = 400;

export type MyGamePositionRow = { game_id: string; ply: number; zkey: string };

/** Position rows (mainline only, unique per ply) for one game's PGN. */
export function myGamePositionRows(gameId: string, pgn: string): MyGamePositionRow[] {
  const imported = importPgn(pgn);
  const { positions } = rowsForTree(imported.tree, gameId, "draws");
  const byPly = new Map<number, MyGamePositionRow>();
  for (const row of positions) {
    if (!byPly.has(row.ply)) {
      byPly.set(row.ply, { game_id: gameId, ply: row.ply, zkey: String(row.zkey) });
    }
    if (byPly.size >= MAX_POSITIONS_PER_GAME) {
      break;
    }
  }
  return [...byPly.values()];
}

export type IndexableGame = { id: string; pgn: string };
export type IndexResult = { indexed: number; failed: number };

/**
 * Index games: write their position rows, then stamp `indexed_at`. A game whose
 * write fails stays unindexed (indexed_at null). Never throws.
 */
export async function indexMyGames(
  service: SupabaseClient<Database>,
  userId: string,
  games: IndexableGame[],
): Promise<IndexResult> {
  let indexed = 0;
  let failed = 0;
  for (const game of games) {
    try {
      const rows = myGamePositionRows(game.id, game.pgn);
      for (let index = 0; index < rows.length; index += INDEX_CHUNK_SIZE) {
        const { error } = await service
          .from("my_game_positions")
          .upsert(rows.slice(index, index + INDEX_CHUNK_SIZE), { onConflict: "game_id,ply" });
        if (error) {
          throw new Error(error.message);
        }
      }
      const { error } = await service
        .from("my_games")
        .update({ indexed_at: new Date().toISOString() })
        .eq("id", game.id)
        .eq("user_id", userId);
      if (error) {
        throw new Error(error.message);
      }
      indexed += 1;
    } catch (error) {
      failed += 1;
      console.error("my-games indexing failed", { gameId: game.id, error });
    }
  }
  return { indexed, failed };
}
