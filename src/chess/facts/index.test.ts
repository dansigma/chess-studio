import assert from "node:assert/strict";
import test from "node:test";
import { computePositionFacts } from "./index.ts";

const MIDDLEGAME = "2rq1rk1/R2n1ppp/4p3/2pb4/5B2/6P1/1Q2PPBP/3R2K1 w - - 0 21";

test("computePositionFacts is deterministic and memoized per FEN", () => {
  const first = computePositionFacts(MIDDLEGAME);
  assert.equal(computePositionFacts(MIDDLEGAME), first);
  assert.deepEqual(JSON.parse(JSON.stringify(first)), first);
});

test("facts are plain data: no sentences, only ids, squares and piece letters", () => {
  const facts = computePositionFacts(MIDDLEGAME);
  const text = JSON.stringify(facts);
  assert.ok(!/\s{2,}|[.!?]\s/.test(text.replace(MIDDLEGAME, "")));
});

test("middlegame fixture: open d-file, rook x-ray, 7th rank, long diagonal", () => {
  const facts = computePositionFacts(MIDDLEGAME);
  assert.equal(facts.turn, "w");
  assert.ok(facts.files.some((f) => f.file === "d" && f.openness === "open"));
  const rook = facts.pieces.find((p) => p.square === "d1");
  assert.deepEqual(rook?.xrayThrough, [{ through: "d5", target: "d7" }]);
  assert.deepEqual(facts.seventhRank, [{ color: "w", squares: ["a7"] }]);
  assert.equal(facts.diagonals.find((d) => d.diagonal === "a1h8")?.controller, "w");
  assert.ok(facts.pawns.some((p) => p.kind === "isolated" && p.square === "c5"));
});

test("an invalid FEN yields empty, flagged facts", () => {
  const facts = computePositionFacts("nope");
  assert.equal(facts.valid, false);
  assert.deepEqual(facts.pieces, []);
});
