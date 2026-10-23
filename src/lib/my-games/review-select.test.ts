// SIG-1090: unit tests for the batch-review selection helpers.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PlayerGame } from "@/src/lib/player-types.ts";
import { isReviewableGame, reviewableSelection, unreviewedReviewableGames } from "./review-select.ts";

function game(id: string, overrides: Partial<PlayerGame> = {}): PlayerGame {
  return {
    id: `ext-${id}`,
    rowId: id,
    winner: null,
    whiteName: "A",
    whiteRating: null,
    blackName: "B",
    blackRating: null,
    year: null,
    month: null,
    event: null,
    eco: null,
    opening: null,
    pgn: '[White "A"]\n\n1. e4 e5 *',
    moves: undefined,
    timeClass: null,
    color: "white",
    playerResult: null,
    playedAt: null,
    userAccuracy: null,
    opponentAccuracy: null,
    reviewedAt: null,
    ...overrides,
  };
}

describe("review selection helpers", () => {
  it("only rows with a row id and pgn are reviewable", () => {
    assert.equal(isReviewableGame(game("a")), true);
    assert.equal(isReviewableGame(game("a", { rowId: null })), false);
    assert.equal(isReviewableGame(game("a", { pgn: "   " })), false);
  });

  it("restricts the selection to reviewable games and drops stale ids", () => {
    const games = [game("a"), game("b", { pgn: undefined }), game("c")];
    const selected = new Set(["a", "b", "gone"]);
    assert.deepEqual(reviewableSelection(games, selected).map((entry) => entry.rowId), ["a"]);
  });

  it("returns unreviewed games in loader order", () => {
    const games = [
      game("a", { reviewedAt: "2026-10-22T00:00:00.000Z" }),
      game("b"),
      game("c", { rowId: null }),
      game("d"),
    ];
    assert.deepEqual(unreviewedReviewableGames(games).map((entry) => entry.rowId), ["b", "d"]);
  });
});
