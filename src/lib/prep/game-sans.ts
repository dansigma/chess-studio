// SIG-1341: one SAN list per game, shared by the dossier openings aggregate and
// the dossier's move-by-move tree. Loaders always set space-separated `moves`
// when moves exist (lichess builds it from NDJSON, chesscom from the cleaned
// PGN); fall back to parsing `pgn`.
import { sanMovesFromPgn } from "@/src/chess/pgn-clean";
import type { PlayerGame } from "@/src/lib/player-types";

export function sanMovesForGame(game: PlayerGame): string[] {
  const line = game.moves?.trim();
  if (line) {
    return line.split(/\s+/).filter(Boolean);
  }
  if (game.pgn?.trim()) {
    return sanMovesFromPgn(game.pgn);
  }
  return [];
}
