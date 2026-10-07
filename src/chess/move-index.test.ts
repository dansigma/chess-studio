import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Chess } from "chess.js";
import { indexedLegalMoves, uciOf } from "./move-index.ts";

function indexOf(fen: string | undefined, uci: string): number {
  const chess = fen ? new Chess(fen) : new Chess();
  return indexedLegalMoves(chess).findIndex((move) => uciOf(move) === uci);
}

describe("caissabase move index", () => {
  it("maps the opening moves used by the 2024 database", () => {
    assert.equal(indexOf(undefined, "e2e4"), 12);
    const afterE4 = new Chess();
    afterE4.move("e4");
    assert.equal(indexOf(afterE4.fen(), "e7e5"), 12);
    const sicilian = new Chess();
    sicilian.move("e4");
    sicilian.move("c5");
    assert.equal(indexOf(sicilian.fen(), "b1c3"), 16);
    assert.equal(indexOf(sicilian.fen(), "g1f3"), 18);
  });
});
