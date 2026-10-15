import assert from "node:assert/strict";
import test from "node:test";
import { computeMoveFacts } from "./index.ts";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const MIDDLEGAME = "2rq1rk1/R2n1ppp/4p3/2pb4/5B2/6P1/1Q2PPBP/3R2K1 w - - 0 21";

function facts(fen: string, uci: string, pv?: string[]) {
  const result = computeMoveFacts(fen, uci, pv);
  assert.ok(result, `${uci} should be legal`);
  return result;
}

test("a quiet opening move: basics, newly controlled squares, no capture", () => {
  const f = facts(START, "e2e4");
  assert.equal(f.san, "e4");
  assert.equal(f.mover, "w");
  assert.equal(f.piece, "p");
  assert.equal(f.capture, null);
  assert.equal(f.check, false);
  assert.equal(f.sacrifice, false);
  assert.deepEqual(f.attacks, []);
  assert.ok(f.newlyControlled.includes("d5") && f.newlyControlled.includes("f5"));
});

test("e4 unblocks the queen and the king's bishop", () => {
  const f = facts(START, "e2e4");
  const bishop = f.unblocks.find((u) => u.square === "f1");
  assert.ok(bishop);
  assert.ok(bishop.gained.includes("a6") && bishop.gained.includes("c4"));
  const queen = f.unblocks.find((u) => u.square === "d1");
  assert.deepEqual(queen?.gained, ["f3", "g4", "h5"]);
});

test("a rook landing on a file cuts the enemy rook's line", () => {
  const f = facts("r3k3/8/8/8/8/8/8/R3K3 w - - 0 1", "a1a5");
  assert.deepEqual(f.blocks, [{ square: "a8", lost: ["a1", "a2", "a3", "a4"] }]);
});

test("captures, checks, mate, promotion and castling", () => {
  const capture = facts("4k3/8/8/3p4/4N3/8/8/4K3 w - - 0 1", "e4d6");
  assert.equal(capture.capture, null);
  const takes = facts("4k3/8/8/3p4/8/8/8/3RK3 w - - 0 1", "d1d5");
  assert.deepEqual(takes.capture, { type: "p", square: "d5", enPassant: false });
  const mate = facts("k7/8/1K6/8/8/8/8/7R w - - 0 1", "h1h8");
  assert.equal(mate.check, true);
  assert.equal(mate.mate, true);
  const promo = facts("4k3/P7/8/8/8/8/8/4K3 w - - 0 1", "a7a8q");
  assert.equal(promo.promotion, "q");
  assert.equal(promo.check, true);
  const castle = facts("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1", "e1g1");
  assert.equal(castle.castle, "k");
  const long = facts("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1", "e1c1");
  assert.equal(long.castle, "q");
});

test("en passant records the captured pawn's square", () => {
  const f = facts("rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3", "e5f6");
  assert.deepEqual(f.capture, { type: "p", square: "f5", enPassant: true });
});

test("sacrifice: a rook takes a defended pawn", () => {
  assert.equal(facts("4k3/8/4p3/3p4/8/8/3R4/4K3 w - - 0 1", "d2d5").sacrifice, true);
  assert.equal(facts("4k3/8/8/3p4/8/8/3R4/4K3 w - - 0 1", "d2d5").sacrifice, false);
});

test("the move that answers a threat lists it as neutralized", () => {
  const f = facts(MIDDLEGAME, "b2a1");
  assert.deepEqual(f.threats.neutralized.map((t) => t.id), ["fork:d8b6:b2+a7"]);
  assert.deepEqual(f.threats.exposed, []);
  assert.deepEqual(f.defends.sort(), ["a7", "d1"]);
});

test("a PV is walked up to its first illegal move", () => {
  const f = facts(START, "e2e4", ["e2e4", "e7e5", "g1f3", "zzzz", "b8c6"]);
  assert.deepEqual(f.pv?.moves, ["e7e5", "g1f3"]);
  assert.equal(f.pv?.materialDelta, 0);
  assert.equal(f.pv?.endsInMate, false);
  const withoutOwnMove = facts(START, "e2e4", ["e7e5", "g1f3"]);
  assert.deepEqual(withoutOwnMove.pv?.moves, ["e7e5", "g1f3"]);
  assert.equal(facts(START, "e2e4").pv, null);
});

test("a PV that wins material for the mover or ends in mate", () => {
  const win = facts("4k3/8/8/3p4/8/8/8/3RK3 w - - 0 1", "d1d5", ["e8e7"]);
  assert.equal(win.pv?.materialDelta, 1);
  const mate = facts("6k1/1p3ppp/8/8/8/8/5PPP/R5K1 w - - 0 1", "g1h1", ["g1h1", "b7b6", "a1a8"]);
  assert.equal(mate.pv?.endsInMate, true);
  assert.deepEqual(mate.pv?.moves, ["b7b6", "a1a8"]);
  assert.equal(facts("6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1", "a1a8").mate, true);
});

test("a PV in which the mover is left a piece down marks the move as a sacrifice", () => {
  const fen = "4k3/8/8/8/8/1b6/NP6/4K3 w - - 0 1";
  assert.equal(facts(fen, "e1e2").sacrifice, false);
  assert.equal(facts(fen, "e1e2", ["b3a2"]).sacrifice, true);
});

test("illegal and malformed moves give null", () => {
  assert.equal(computeMoveFacts(START, "e2e5"), null);
  assert.equal(computeMoveFacts(START, "xx"), null);
  assert.equal(computeMoveFacts("garbage", "e2e4"), null);
});

test("move facts are memoized per FEN, move and PV", () => {
  assert.equal(computeMoveFacts(START, "e2e4"), computeMoveFacts(START, "e2e4"));
});
