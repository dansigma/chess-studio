import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { threatNullFenFor, threatSquaresFromUci } from "./useThreat";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
// Fool's mate final: 1. f3 e5 2. g4 Qh4# — black just mated, game over.
const CHECKMATE_FEN = "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3";
// Stalemate: black to move, king h8, queen g7 + king f7 — no legal moves.
const STALEMATE_FEN = "7k/5Q2/5K2/8/8/8/8/8 b - - 0 1";

describe("useThreat helpers (SIG-906)", () => {
  test("threatNullFenFor returns a swapped-turn FEN for a live position", () => {
    const nullFen = threatNullFenFor(START_FEN);
    assert.ok(nullFen, "expected a null-move FEN");
    assert.equal(nullFen?.split(" ")[1], "b");
  });

  test("threatNullFenFor no-ops on checkmate, stalemate, and bad FEN", () => {
    assert.equal(threatNullFenFor(CHECKMATE_FEN), null);
    assert.equal(threatNullFenFor(STALEMATE_FEN), null);
    assert.equal(threatNullFenFor("not a fen"), null);
  });

  test("threatSquaresFromUci maps the first best-line move to squares", () => {
    assert.deepEqual(threatSquaresFromUci("e7e5"), { from: "e7", to: "e5" });
    assert.deepEqual(threatSquaresFromUci("e7e8q"), { from: "e7", to: "e8" });
  });

  test("threatSquaresFromUci rejects malformed UCI", () => {
    assert.equal(threatSquaresFromUci(undefined), null);
    assert.equal(threatSquaresFromUci("e2"), null);
    assert.equal(threatSquaresFromUci("e2e2"), null);
    assert.equal(threatSquaresFromUci("z9a1"), null);
  });
});
