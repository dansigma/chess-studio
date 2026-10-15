import assert from "node:assert/strict";
import test from "node:test";
import { computePositionFacts } from "./index.ts";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function kinds(fen: string, square: string): string[] {
  return computePositionFacts(fen)
    .pawns.filter((p) => p.square === square)
    .map((p) => p.kind)
    .sort();
}

test("starting position has no pawn weaknesses, weak squares or outposts", () => {
  const facts = computePositionFacts(START);
  assert.deepEqual(facts.pawns, []);
  assert.deepEqual(facts.weakSquares, []);
  assert.deepEqual(facts.outposts, []);
});

test("isolated pawn", () => {
  assert.deepEqual(kinds("4k3/3p4/8/8/8/8/2P5/4K3 w - - 0 1", "c2"), ["isolated"]);
});

test("doubled pawns point at each other", () => {
  const facts = computePositionFacts("4k3/8/8/8/8/P7/P7/4K3 w - - 0 1");
  const doubled = facts.pawns.filter((p) => p.kind === "doubled");
  assert.deepEqual(
    doubled.map((p) => [p.square, p.with]).sort(),
    [["a2", ["a3"]], ["a3", ["a2"]]],
  );
});

test("passed pawn, and not passed when an enemy pawn guards the path", () => {
  assert.ok(kinds("4k3/8/8/8/3P4/8/8/4K3 w - - 0 1", "d4").includes("passed"));
  assert.ok(!kinds("4k3/2p5/8/8/3P4/8/8/4K3 w - - 0 1", "d4").includes("passed"));
  assert.ok(!kinds("4k3/3p4/8/8/3P4/8/8/4K3 w - - 0 1", "d4").includes("passed"));
});

test("passed pawn for black is read from black's side", () => {
  assert.ok(kinds("4k3/8/8/3p4/8/8/8/4K3 w - - 0 1", "d5").includes("passed"));
  assert.ok(!kinds("4k3/8/8/3p4/8/2P5/8/4K3 w - - 0 1", "d5").includes("passed"));
});

test("backward pawn: neighbours are ahead and the stop square is attacked", () => {
  const fen = "4k3/8/8/4p3/2P1P3/3P4/8/4K3 w - - 0 1";
  assert.ok(kinds(fen, "d3").includes("backward"));
  assert.ok(!kinds(fen, "c4").includes("backward"));
  assert.ok(!kinds(fen, "d3").includes("isolated"));
});

test("weak squares: no pawn can ever challenge them and the enemy eyes them", () => {
  // b4 is hit by the black bishop; white's only pawn is on h2, far from the b-file.
  const hole = computePositionFacts("4k3/8/8/8/1b6/8/7P/4K3 w - - 0 1");
  assert.ok(hole.weakSquares.some((w) => w.side === "w" && w.square === "b4"));
  // A white pawn on a2 or c2 can still advance to attack b4.
  const guarded = computePositionFacts("4k3/8/8/8/1b6/8/P1P5/4K3 w - - 0 1");
  assert.ok(!guarded.weakSquares.some((w) => w.side === "w" && w.square === "b4"));
});

test("outpost: supported knight that no enemy pawn can attack", () => {
  const fen = "4k3/8/8/3N4/2P5/8/8/4K3 w - - 0 1";
  assert.deepEqual(computePositionFacts(fen).outposts, [{ color: "w", square: "d5", occupant: "n" }]);
  const challenged = "4k3/4p3/8/3N4/2P5/8/8/4K3 w - - 0 1";
  assert.deepEqual(computePositionFacts(challenged).outposts, []);
});
