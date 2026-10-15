import assert from "node:assert/strict";
import test from "node:test";
import { START_FEN, createEmptyTree, insertLine, pathAlongLine } from "./tree.ts";

function move(san: string, uci: string) {
  return { san, uci, fen: `${san}-${uci}`, from: uci.slice(0, 2), to: uci.slice(2, 4) };
}

test("pathAlongLine follows existing children, including variations", () => {
  let tree = createEmptyTree(START_FEN);
  tree = insertLine(tree, [], [move("e4", "e2e4"), move("e5", "e7e5")]);
  tree = insertLine(tree, [0], [move("c5", "c7c5"), move("Nf3", "g1f3")]);
  assert.deepEqual(pathAlongLine(tree, [], ["e2e4", "e7e5"]), [0, 0]);
  assert.deepEqual(pathAlongLine(tree, [0], ["c7c5", "g1f3"]), [0, 1, 0]);
  assert.deepEqual(pathAlongLine(tree, [], []), []);
});

test("pathAlongLine returns null when the line leaves the tree", () => {
  let tree = createEmptyTree(START_FEN);
  tree = insertLine(tree, [], [move("e4", "e2e4")]);
  assert.equal(pathAlongLine(tree, [], ["e2e4", "e7e5"]), null);
  assert.equal(pathAlongLine(tree, [5], ["e2e4"]), null);
});
