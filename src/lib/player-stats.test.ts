import assert from "node:assert/strict";
import test from "node:test";
import { Chess } from "chess.js";
import { buildPlayerIndex, playerGamesFromIndex, playerMoveStatsFromIndex } from "./player-stats";
import type { PlayerGame } from "./player-types";

function game(id: string, moves: string, color: PlayerGame["color"], playedAt: number, pgn?: string): PlayerGame {
  return {
    id, moves, color, playedAt, pgn, winner: "white", playerResult: color === "white" ? "win" : "loss",
    whiteName: "White", whiteRating: null, blackName: "Black", blackRating: null,
    year: null, month: null, event: null, eco: null, opening: null,
  };
}

test("position games include final positions, they are unique across repetitions and sorted by date", () => {
  const index = buildPlayerIndex([
    game("old", "e4", "white", 10),
    game("repeat", "e4 Nf6 Nf3 Ng8 Ng1", "white", 30),
    game("pgn", "", "black", 20, "1. e4 c5 0-1"),
    game("other-line", "d4", "white", 40),
  ]);
  const chess = new Chess();
  chess.move("e4");
  assert.deepEqual(playerGamesFromIndex(index, chess.fen()).map(({ id }) => id), ["repeat", "pgn", "old"]);
  assert.deepEqual(playerMoveStatsFromIndex(index, chess.fen(), true).map(({ san }) => san), ["c5"]);
  assert.deepEqual(playerMoveStatsFromIndex(index, chess.fen()).map(({ san }) => san), ["Nf6", "c5"]);
  chess.move("c5");
  assert.deepEqual(playerGamesFromIndex(index, chess.fen()).map(({ id }) => id), ["pgn"]);
  assert.deepEqual(playerMoveStatsFromIndex(index, chess.fen(), true), []);
});
