import assert from "node:assert/strict";
import test from "node:test";
import { analyze, attackersOf, parseFen, squareIndex, squareName } from "./board.ts";

const FENS = [
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  "2rq1rk1/R2n1ppp/4p3/2pb4/5B2/6P1/1Q2PPBP/3R2K1 w - - 0 21",
  "r3k2r/pp1n1ppp/2p1pn2/q7/3P4/2N1BN2/PPQ2PPP/R3KB1R w KQkq - 0 1",
  "4k3/P7/8/8/8/8/8/4K3 w - - 0 1",
];

test("square names round-trip through indexes", () => {
  for (let i = 0; i < 64; i++) {
    assert.equal(squareIndex(squareName(i)), i);
  }
  assert.equal(squareIndex("i9"), -1);
  assert.equal(squareIndex(""), -1);
});

test("parseFen reads placement, turn, castling and en passant", () => {
  const parsed = parseFen("rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3");
  assert.ok(parsed);
  assert.equal(parsed.turn, "w");
  assert.equal(parsed.castling, "KQkq");
  assert.equal(parsed.enPassant, "f6");
  assert.deepEqual(parsed.board[squareIndex("e5")], { type: "p", color: "w" });
});

test("parseFen rejects malformed placement instead of throwing", () => {
  assert.equal(parseFen("garbage"), null);
  assert.equal(parseFen("8/8/8/8/8/8/8 w - - 0 1"), null);
  assert.equal(parseFen("9/8/8/8/8/8/8/8 w - - 0 1"), null);
  assert.equal(parseFen("xnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w - - 0 1"), null);
});

test("looking outward from a square finds the same attackers as the forward pass", () => {
  for (const fen of FENS) {
    const parsed = parseFen(fen);
    assert.ok(parsed);
    const analysis = analyze(parsed.board);
    for (const color of ["w", "b"] as const) {
      for (let sq = 0; sq < 64; sq++) {
        assert.deepEqual(
          attackersOf(parsed.board, sq, color),
          [...(analysis.attackedBy[color][sq] ?? [])].sort((a, b) => a - b),
          `${fen} ${color} ${squareName(sq)}`,
        );
      }
    }
  }
});
