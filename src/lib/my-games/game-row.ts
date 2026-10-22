// SIG-1088: maps a normalized PlayerGame to a `public.my_games` insert row.
// Pure function (no Supabase import); the sync route skips `null` results so
// one unmappable game never fails a sync.
import type { PlayerGame } from "@/src/lib/player-types";
import type { Database } from "@/src/lib/supabase/database.types";

export type MyGamesSource = "lichess" | "chesscom";

type MyGamesInsert = Database["public"]["my_games"]["Insert"];

// Matches the migration check `octet_length(pgn) <= 1000000`.
const MAX_PGN_BYTES = 1_000_000;

function truncateUtf8(text: string, maxBytes: number): string {
  const bytes = new TextEncoder().encode(text);
  if (bytes.length <= maxBytes) {
    return text;
  }
  const sliced = bytes.slice(0, maxBytes);
  return new TextDecoder("utf-8", { fatal: false }).decode(sliced);
}

export function playerGameToRow(
  userId: string,
  source: MyGamesSource,
  game: PlayerGame,
): MyGamesInsert | null {
  const pgn = game.pgn?.trim() ? truncateUtf8(game.pgn.trim(), MAX_PGN_BYTES).trim() : "";
  if (!userId || !game.id || !pgn) {
    return null;
  }
  const moves = game.moves?.trim() ?? "";
  return {
    user_id: userId,
    source,
    external_id: game.id,
    played_at: typeof game.playedAt === "number" ? new Date(game.playedAt).toISOString() : null,
    color: game.color,
    result: game.playerResult,
    time_class: game.timeClass ?? null,
    white: game.whiteName,
    black: game.blackName,
    white_elo: game.whiteRating,
    black_elo: game.blackRating,
    eco: game.eco,
    opening: game.opening,
    ply_count: moves ? moves.split(/\s+/).filter(Boolean).length : 0,
    pgn,
  };
}
