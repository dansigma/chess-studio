// SIG-1219: click-to-jump cycling on the report card's classification counts.
import assert from "node:assert/strict";
import test from "node:test";
import { nextTierPath, tierPaths, type TierMove } from "./review-tier-nav.ts";

const rows: TierMove[] = [
  { path: [0], side: "w", label: "best" },
  { path: [0, 0], side: "b", label: "blunder" },
  { path: [0, 0, 0], side: "w", label: "blunder" },
  { path: [0, 0, 0, 0], side: "b", label: "best" },
  { path: [0, 0, 0, 0, 0], side: "w", label: "blunder" },
  { path: [0, 0, 0, 0, 0, 0], side: "b", label: null },
];

test("tierPaths keeps game order and filters by side and tier", () => {
  assert.deepEqual(tierPaths(rows, "w", "blunder"), [
    [0, 0, 0],
    [0, 0, 0, 0, 0],
  ]);
  assert.deepEqual(tierPaths(rows, "b", "blunder"), [[0, 0]]);
  assert.deepEqual(tierPaths(rows, "b", "miss"), []);
});

test("first click goes to the first move of the tier, then it cycles in game order and wraps", () => {
  const paths = tierPaths(rows, "w", "blunder");
  // Board on a move that is not one of them (start position, or another tier).
  assert.deepEqual(nextTierPath(paths, []), [0, 0, 0]);
  assert.deepEqual(nextTierPath(paths, [0]), [0, 0, 0]);
  assert.deepEqual(nextTierPath(paths, [0, 0, 0]), [0, 0, 0, 0, 0]);
  assert.deepEqual(nextTierPath(paths, [0, 0, 0, 0, 0]), [0, 0, 0], "wraps to the first");
});

test("a single move stays put and an empty list has nowhere to go", () => {
  assert.deepEqual(nextTierPath([[0, 0]], [0, 0]), [0, 0]);
  assert.equal(nextTierPath([], [0]), null);
  assert.equal(nextTierPath([[0]], null) !== null, true);
});
