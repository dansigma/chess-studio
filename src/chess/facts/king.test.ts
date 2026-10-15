import assert from "node:assert/strict";
import test from "node:test";
import { computePositionFacts } from "./index.ts";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const MIDDLEGAME = "2rq1rk1/R2n1ppp/4p3/2pb4/5B2/6P1/1Q2PPBP/3R2K1 w - - 0 21";

function king(fen: string, color: "w" | "b") {
  const found = computePositionFacts(fen).kings.find((k) => k.color === color);
  assert.ok(found);
  return found;
}

test("uncastled kings keep their castling rights and an intact shield", () => {
  const white = king(START, "w");
  assert.equal(white.castling, "uncastled");
  assert.deepEqual(white.canCastle, { king: true, queen: true });
  assert.equal(white.shieldIntact, true);
  assert.deepEqual(white.openFiles, []);
});

test("castled kings with their pawn shield", () => {
  const white = king(MIDDLEGAME, "w");
  assert.equal(white.castling, "castled");
  assert.deepEqual(white.shieldPawns.sort(), ["f2", "g3", "h2"]);
  assert.equal(white.shieldIntact, true);
});

test("missing shield pawn and the open file toward the king", () => {
  const fen = "6k1/5p1p/8/8/8/8/8/6K1 w - - 0 1";
  const black = king(fen, "b");
  assert.deepEqual(black.missingShieldFiles, ["g"]);
  assert.equal(black.shieldIntact, false);
  assert.deepEqual(black.openFiles, [{ file: "g", openness: "open" }]);
});

test("a file with only enemy pawns is half-open toward the king", () => {
  const fen = "6k1/5ppp/8/8/8/8/8/6K1 w - - 0 1";
  const white = king(fen, "w");
  assert.deepEqual(
    white.openFiles.map((f) => [f.file, f.openness]),
    [["f", "half-open"], ["g", "half-open"], ["h", "half-open"]],
  );
});

test("a position without a king yields no king facts", () => {
  assert.deepEqual(computePositionFacts("8/8/8/8/8/8/8/4K3 w - - 0 1").kings.map((k) => k.color), ["w"]);
});
