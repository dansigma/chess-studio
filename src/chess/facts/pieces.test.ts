import assert from "node:assert/strict";
import test from "node:test";
import { computePositionFacts } from "./index.ts";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const MIDDLEGAME = "2rq1rk1/R2n1ppp/4p3/2pb4/5B2/6P1/1Q2PPBP/3R2K1 w - - 0 21";

function pieceAt(fen: string, square: string) {
  const found = computePositionFacts(fen).pieces.find((piece) => piece.square === square);
  assert.ok(found, `no piece on ${square}`);
  return found;
}

test("starting position: every piece is present and nothing is loose", () => {
  const facts = computePositionFacts(START);
  assert.equal(facts.valid, true);
  assert.equal(facts.pieces.length, 32);
  assert.equal(facts.pieces.filter((p) => p.hanging).length, 0);
  assert.equal(facts.pieces.filter((p) => p.pinned).length, 0);
  assert.equal(facts.pieces.filter((p) => p.trapped).length, 0);
  assert.equal(facts.pieces.flatMap((p) => p.xrayThrough).length, 0);
  assert.equal(facts.skewers.length, 0);
});

test("piece roles list attacked and defended squares and counts", () => {
  const knight = pieceAt(START, "g1");
  assert.deepEqual(knight.attacks, ["e2", "f3", "h3"]);
  assert.deepEqual(knight.defends, ["e2"]);
  assert.deepEqual(knight.attacksPieces, []);
  const pawn = pieceAt(START, "e2");
  assert.deepEqual(pawn.defenders.sort(), ["d1", "f1", "g1"].concat("e1").sort());
  assert.deepEqual(pawn.attackers, []);
});

test("blocked flags a pawn whose forward square is occupied", () => {
  const fen = "4k3/8/8/4p3/4P3/8/8/4K3 w - - 0 1";
  assert.equal(pieceAt(fen, "e4").blocked, true);
  assert.equal(pieceAt(fen, "e5").blocked, true);
  assert.equal(pieceAt(START, "e2").blocked, false);
});

test("absolute pin: the pinned piece points at its pinner and the king", () => {
  const fen = "4k3/4r3/8/8/8/8/4N3/4K3 w - - 0 1";
  assert.deepEqual(pieceAt(fen, "e2").pinned, { kind: "absolute", by: "e7", to: "e1" });
  assert.equal(pieceAt(fen, "e7").pinned, null);
});

test("relative pin: a minor piece pinned against a rook", () => {
  const fen = "4q1k1/8/8/8/8/4N3/8/4R1K1 w - - 0 1";
  assert.deepEqual(pieceAt(fen, "e3").pinned, { kind: "relative", by: "e8", to: "e1" });
});

test("equal-value pieces on a ray are not a pin", () => {
  const fen = "4r1k1/8/8/8/8/4N3/8/4N1K1 w - - 0 1";
  assert.equal(pieceAt(fen, "e3").pinned, null);
});

test("skewer: valuable front piece with another piece behind it", () => {
  const queenFront = computePositionFacts("r5k1/8/8/8/q7/8/8/R3K3 w - - 0 1");
  assert.deepEqual(queenFront.skewers, [{ by: "a1", front: "a4", behind: "a8" }]);
  const kingFront = computePositionFacts("4r1k1/8/8/8/4K3/8/8/4Q3 w - - 0 1");
  assert.deepEqual(kingFront.skewers, [{ by: "e8", front: "e4", behind: "e1" }]);
});

test("x-ray through a piece on an open file", () => {
  const fen = "3r2k1/8/8/8/3q4/8/8/3R2K1 w - - 0 1";
  assert.deepEqual(pieceAt(fen, "d1").xrayThrough, [{ through: "d4", target: "d8" }]);
});

test("x-ray in the middlegame fixture: rook d1 sees past the bishop to the knight", () => {
  assert.deepEqual(pieceAt(MIDDLEGAME, "d1").xrayThrough, [{ through: "d5", target: "d7" }]);
  assert.deepEqual(pieceAt(MIDDLEGAME, "f8").xrayThrough, [{ through: "f7", target: "f4" }]);
});

test("hanging: an undefended piece that is attacked", () => {
  const fen = "4k3/8/8/3n4/8/8/8/3QK3 w - - 0 1";
  const knight = pieceAt(fen, "d5");
  assert.equal(knight.hanging, true);
  assert.deepEqual(knight.attackers, ["d1"]);
  assert.deepEqual(knight.defenders, []);
});

test("hanging: a defended piece attacked by a cheaper one", () => {
  const fen = "4k3/8/4p3/3q4/8/2N5/8/4K3 w - - 0 1";
  const queen = pieceAt(fen, "d5");
  assert.deepEqual(queen.defenders, ["e6"]);
  assert.equal(queen.hanging, true);
});

test("a defended piece attacked by an equal one is not hanging", () => {
  const fen = "4k3/8/4p3/3n4/8/2N5/8/4K3 w - - 0 1";
  assert.equal(pieceAt(fen, "d5").hanging, false);
});

test("trapped: attacked piece with no safe square", () => {
  const fen = "1k6/B1p5/1p6/8/8/8/8/4K3 b - - 0 1";
  const bishop = pieceAt(fen, "a7");
  assert.equal(bishop.hanging, true);
  assert.deepEqual(bishop.safeSquares, []);
  assert.equal(bishop.trapped, true);
});

test("a piece with room to move is not trapped even when attacked", () => {
  const fen = "4k3/8/8/3n4/8/8/8/3QK3 w - - 0 1";
  const knight = pieceAt(fen, "d5");
  assert.ok(knight.safeSquares.length > 0);
  assert.equal(knight.trapped, false);
});

test("odd positions never throw: promotion rank, en passant, missing kings", () => {
  for (const fen of [
    "4k3/P7/8/8/8/8/8/4K3 w - - 0 1",
    "rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3",
    "8/8/8/8/8/8/8/8 w - - 0 1",
    "not a fen",
  ]) {
    assert.doesNotThrow(() => computePositionFacts(fen));
  }
  assert.equal(computePositionFacts("not a fen").valid, false);
});

test("an absolutely pinned piece only has safe squares along the pin line", () => {
  const bishop = pieceAt("k3r3/8/8/8/8/8/4B3/4K3 w - - 0 1", "e2");
  assert.equal(bishop.pinned?.kind, "absolute");
  assert.deepEqual(bishop.safeSquares, []);
});
