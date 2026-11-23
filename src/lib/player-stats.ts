import { Chess } from "chess.js";
import { sanMovesFromPgn } from "@/src/chess/pgn-clean";
import type { ExplorerMoveRow } from "@/src/lib/explorer-types";
import type { PlayerColorFilter, PlayerGame, PlayerResultFilter } from "@/src/lib/player-types";

export type IndexedHit = {
  san: string;
  uci: string;
  playerResult: PlayerGame["playerResult"];
  playerMoved: boolean;
};

export type PlayerPositionIndex = {
  moves: Map<string, IndexedHit[]>;
  games: Map<string, Map<string, PlayerGame>>;
};

export function filterPlayerGames(games: PlayerGame[], color: PlayerColorFilter, result: PlayerResultFilter) {
  return games.filter((game) =>
    (color === "all" || game.color === color) && (result === "all" || game.playerResult === result),
  );
}

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
  const index: PlayerPositionIndex = { moves: new Map(), games: new Map() };
  const chess = new Chess();

  function recordPosition(fen: string, game: PlayerGame) {
    let reached = index.games.get(fen);
    if (!reached) {
      reached = new Map();
      index.games.set(fen, reached);
    }
    reached.set(game.id, game);
  }

  for (const game of games) {
    chess.reset();
    const startFen = game.pgn?.match(/^\s*\[FEN "([^"]+)"\]/m)?.[1];
    if (startFen) {
      try {
        chess.load(startFen);
      } catch {
        continue;
      }
    }
    const sans = sansForGame(game);
    if (game.pgn?.trim() || sans.length > 0) recordPosition(normalizeFen(chess.fen()), game);
    for (const san of sans) {
      const fen = normalizeFen(chess.fen());
      let played;
      try {
        played = chess.move(san);
      } catch {
        break;
      }
      const hit: IndexedHit = {
        san: played.san,
        uci: `${played.from}${played.to}${played.promotion ?? ""}`,
        playerResult: game.playerResult,
        playerMoved: played.color === (game.color === "white" ? "w" : "b"),
      };
      const hits = index.moves.get(fen);
      if (hits) hits.push(hit);
      else index.moves.set(fen, [hit]);
      recordPosition(normalizeFen(chess.fen()), game);
    }
  }
  return index;
}

export function playerMoveStatsFromIndex(
  index: PlayerPositionIndex,
  fen: string,
  playerMovesOnly = false,
): ExplorerMoveRow[] {
  const hits = index.moves.get(normalizeFen(fen)) ?? [];
  const moves = new Map<
    string,
    { san: string; uci: string; white: number; draws: number; black: number }
  >();
  for (const hit of hits) {
    if (playerMovesOnly && !hit.playerMoved) continue;
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

export function playerGamesFromIndex(index: PlayerPositionIndex, fen: string): PlayerGame[] {
  function date(game: PlayerGame): number {
    return game.playedAt ?? (game.year ? Date.UTC(game.year, (game.month ?? 1) - 1) : -Infinity);
  }
  return [...(index.games.get(normalizeFen(fen))?.values() ?? [])].sort((a, b) => date(b) - date(a));
}
