import assert from "node:assert/strict";
import test from "node:test";
import { chesscomWinner, compactChesscomGame } from "./chesscom.ts";

test("chesscomWinner reads the winning side and defaults to a draw", () => {
  assert.equal(chesscomWinner({ white: { result: "win" } }), "white");
  assert.equal(chesscomWinner({ black: { result: "win" } }), "black");
  assert.equal(chesscomWinner({ white: { result: "checkmated" }, black: { result: "resigned" } }), "draw");
  assert.equal(chesscomWinner({}), "draw");
});

test("compactChesscomGame normalizes a Chess.com archive game", () => {
  const game = compactChesscomGame(
    {
      url: "https://www.chess.com/game/live/123456",
      end_time: 1_600_000_000,
      time_class: "blitz",
      eco: "C50",
      white: { username: "Alice", rating: 1500, result: "win" },
      black: { username: "Bob", rating: 1400, result: "checkmated" },
    },
    "alice",
    0,
  );
  assert.equal(game.id, "123456");
  assert.equal(game.winner, "white");
  assert.equal(game.whiteName, "Alice");
  assert.equal(game.whiteRating, 1500);
  assert.equal(game.blackName, "Bob");
  assert.equal(game.blackRating, 1400);
  assert.equal(game.year, 2020);
  assert.equal(game.month, 9);
  assert.equal(game.event, "Chess.com");
  assert.equal(game.eco, "C50");
  assert.equal(game.opening, null);
  assert.equal(game.moves, undefined);
  assert.equal(game.timeClass, "blitz");
  assert.equal(game.color, "white");
  assert.equal(game.playerResult, "win");
  assert.equal(game.playedAt, 1_600_000_000_000);
});

test("compactChesscomGame marks the requested player as black and falls back to a synthetic id", () => {
  const game = compactChesscomGame(
    {
      end_time: 1_600_000_000,
      white: { username: "Alice", rating: 1500, result: "win" },
      black: { username: "Bob", rating: 1400, result: "checkmated" },
    },
    "bob",
    7,
  );
  assert.equal(game.id, "Alice-Bob-1600000000000");
  assert.equal(game.color, "black");
  assert.equal(game.playerResult, "loss");
});
