import assert from "node:assert/strict";
import test from "node:test";
import { compareThreats, computeThreats, computeThreatsToMove } from "./index.ts";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const MIDDLEGAME = "2rq1rk1/R2n1ppp/4p3/2pb4/5B2/6P1/1Q2PPBP/3R2K1 w - - 0 21";

const ids = (set: { threats: Array<{ id: string }> }) => set.threats.map((t) => t.id);

test("the starting position carries no threats", () => {
  assert.deepEqual(computeThreats(START), { by: "b", status: "ok", threats: [] });
});

test("mate-in-1 threat from the side that is not to move", () => {
  const set = computeThreats("r5k1/5ppp/8/8/8/8/5PPP/6K1 w - - 0 1");
  assert.equal(set.by, "b");
  assert.deepEqual(ids(set), ["mate-in-1:a8a1:g1"]);
  assert.deepEqual(set.threats[0]?.targets, ["g1"]);
});

test("hanging-capture: the opponent could take an undefended piece", () => {
  const set = computeThreats("4k3/8/8/3p4/4N3/8/8/4K3 w - - 0 1");
  assert.deepEqual(ids(set), ["hanging-capture:d5e4:n"]);
  assert.deepEqual(set.threats[0]?.targets, ["e4"]);
});

test("winning-capture: a cheaper piece attacks a defended one", () => {
  const set = computeThreats("4k3/8/8/3p4/4N3/5P2/8/4K3 w - - 0 1");
  assert.deepEqual(ids(set), ["winning-capture:d5e4:n"]);
});

test("a defended piece attacked by an equal piece is no threat", () => {
  const set = computeThreats("4k3/8/8/3n4/4N3/5P2/8/4K3 w - - 0 1");
  assert.deepEqual(ids(set), []);
});

test("fork: the middlegame fixture allows ...Qb6 hitting queen and rook", () => {
  const set = computeThreats(MIDDLEGAME);
  assert.deepEqual(ids(set), ["fork:d8b6:b2+a7"]);
  assert.deepEqual(set.threats[0]?.targets, ["b2", "a7"]);
});

test("a fork onto a square where the forker is lost is not a threat", () => {
  const set = computeThreats("4k3/8/8/8/8/2n5/4P3/R3K2R b - - 0 1");
  assert.ok(!ids(set).some((id) => id.startsWith("fork:")));
});

test("no null move while the side to move is in check", () => {
  const set = computeThreats("4k3/8/8/8/8/8/4r3/4K3 w - - 0 1");
  assert.deepEqual(set, { by: "b", status: "in-check", threats: [] });
});

test("finished games and broken FENs are reported, not thrown", () => {
  const mated = computeThreats("rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3");
  assert.equal(mated.status, "game-over");
  assert.equal(computeThreats("garbage").status, "invalid");
  assert.equal(computeThreatsToMove("garbage").status, "invalid");
});

test("threats to move use the real moves of the side to move", () => {
  const set = computeThreatsToMove("r3k3/8/8/8/8/8/8/Q3K3 w - - 0 1");
  assert.equal(set.by, "w");
  assert.deepEqual(ids(set), ["hanging-capture:a1a8:r"]);
});

test("compareThreats: the move neutralizes the threat it answers", () => {
  const result = compareThreats(MIDDLEGAME, "b2a1");
  assert.ok(result);
  assert.equal(result.mover, "w");
  assert.deepEqual(ids(result.before), ["fork:d8b6:b2+a7"]);
  assert.deepEqual(ids(result.after), []);
  assert.deepEqual(result.neutralized.map((t) => t.id), ["fork:d8b6:b2+a7"]);
  assert.deepEqual(result.persisting, []);
  assert.deepEqual(result.exposed, []);
});

test("compareThreats: a move that leaves the threat standing", () => {
  const result = compareThreats(MIDDLEGAME, "g1h1");
  assert.ok(result);
  assert.deepEqual(result.persisting.map((t) => t.id), ["fork:d8b6:b2+a7"]);
  assert.deepEqual(result.neutralized, []);
});

test("compareThreats: exposed and created threats", () => {
  const fen = "r3k3/8/8/8/8/8/8/Q3K3 w - - 0 1";
  const result = compareThreats(fen, "a1a3");
  assert.ok(result);
  assert.deepEqual(ids(result.before), ["hanging-capture:a8a1:q"]);
  assert.deepEqual(result.neutralized.map((t) => t.id), ["hanging-capture:a8a1:q"]);
  assert.deepEqual(result.exposed.map((t) => t.id), ["hanging-capture:a8a3:q"]);
  assert.deepEqual(ids(result.created), ["hanging-capture:a3a8:r"]);
});

test("compareThreats: a move answering a check has no null-move threats before it", () => {
  const result = compareThreats("4k3/8/8/8/8/8/4r3/4K3 w - - 0 1", "e1e2");
  assert.ok(result);
  assert.equal(result.before.status, "in-check");
  assert.deepEqual(result.before.threats, []);
});

test("compareThreats rejects illegal or malformed moves", () => {
  assert.equal(compareThreats(START, "e2e5"), null);
  assert.equal(compareThreats(START, "zz"), null);
  assert.equal(compareThreats("garbage", "e2e4"), null);
});

test("threat results are memoized per FEN", () => {
  assert.equal(computeThreats(MIDDLEGAME), computeThreats(MIDDLEGAME));
  assert.equal(compareThreats(MIDDLEGAME, "b2a1"), compareThreats(MIDDLEGAME, "b2a1"));
});

test("a capturing promotion is one threat, not one per promotion piece", () => {
  const set = computeThreatsToMove("r3k3/1P6/8/8/8/8/8/4K3 w - - 0 1");
  const captures = set.threats.filter((t) => t.kind === "hanging-capture");
  assert.equal(captures.length, 1);
  assert.equal(captures[0]?.id, "hanging-capture:b7a8:r");
});

test("the same move against a different victim is a different threat", () => {
  const rook = computeThreatsToMove("4k3/8/8/8/4p3/8/8/4RK2 w - - 0 1").threats.map((t) => t.id);
  const knight = computeThreatsToMove("4k3/8/8/8/4n3/8/8/4RK2 w - - 0 1").threats.map((t) => t.id);
  assert.ok(rook.includes("hanging-capture:e1e4:p"));
  assert.ok(knight.includes("hanging-capture:e1e4:n"));
});
