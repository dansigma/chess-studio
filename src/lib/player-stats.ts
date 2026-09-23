import { Chess } from "chess.js";
import { sanMovesFromPgn } from "@/src/chess/pgn-clean";
import type { ExplorerMoveRow } from "@/src/lib/explorer-types";
import type { PlayerGame } from "@/src/lib/player-types";

export type IndexedHit = {
  san: string;
  uci: string;
  playerResult: PlayerGame["playerResult"];
};

export type PlayerPositionIndex = Map<string, IndexedHit[]>;

export function normalizeFen(fen: string): string {
  return fen.split(" ").slice(0, 4).join(" ");
}

function sansForGame(game: PlayerGame): string[] {
  if (game.moves?.trim()) {
    return game.moves.trim().split(/\s+/).filter(Boolean);
  }
  if (game.pgn) {
    return sanMovesFromPgn(game.pgn);
  }
  return [];
}

export function buildPlayerIndex(games: PlayerGame[]): PlayerPositionIndex {
  const index: PlayerPositionIndex = new Map();
  const chess = new Chess();
  for (const game of games) {
    chess.reset();
    for (const san of sansForGame(game)) {
      const fen = normalizeFen(chess.fen());
      let played;
      try {
        played = chess.move(san);
      } catch {
        break;
      }
      const uci = `${played.from}${played.to}${played.promotion ?? ""}`;
      const hits = index.get(fen);
      const hit: IndexedHit = {
        san: played.san,
        uci,
        playerResult: game.playerResult,
      };
      if (hits) {
        hits.push(hit);
      } else {
        index.set(fen, [hit]);
      }
    }
  }
  return index;
}

export function playerMoveStatsFromIndex(
  index: PlayerPositionIndex,
  fen: string,
): ExplorerMoveRow[] {
  const hits = index.get(normalizeFen(fen)) ?? [];
  const moves = new Map<
    string,
    { san: string; uci: string; white: number; draws: number; black: number }
  >();
  for (const hit of hits) {
    const current = moves.get(hit.uci) ?? {
      san: hit.san,
      uci: hit.uci,
      white: 0,
      draws: 0,
      black: 0,
    };
    if (hit.playerResult === "win") {
      current.white += 1;
    } else if (hit.playerResult === "draw") {
      current.draws += 1;
    } else {
      current.black += 1;
    }
    moves.set(hit.uci, current);
  }
  return [...moves.values()]
    .map((move) => ({
      san: move.san,
      uci: move.uci,
      white: move.white,
      draws: move.draws,
      black: move.black,
      games: move.white + move.draws + move.black,
      averageRating: null,
    }))
    .sort((a, b) => b.games - a.games);
}

export function playerMoveStats(games: PlayerGame[], fen: string): ExplorerMoveRow[] {
  return playerMoveStatsFromIndex(buildPlayerIndex(games), fen);
}
