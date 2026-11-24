import assert from "node:assert/strict";
import test from "node:test";
import { Chess } from "chess.js";
import { bookKey } from "@/src/chess/opening-book";
import { START_FEN, type TreeNode } from "@/src/chess/tree";
import { currentHistoryKey, gameHistoryKeys } from "./history-keys";

function line(moves: string[]): TreeNode {
  const chess = new Chess();
  const nodes: TreeNode[] = moves.map((san) => {
    const { from, to } = chess.move(san);
    return { id: crypto.randomUUID(), san, uci: from + to, fen: chess.fen(), from, to, children: [] } satisfies TreeNode;
  });
  for (let index = 1; index < nodes.length; index++) {
    nodes[index - 1].children.push(nodes[index]);
  }
  return nodes[0];
}

const key = (fen: string) => bookKey(fen).toString();

test("collects the root and whole mainline before variations and deduplicates transpositions", () => {
  const main = line(["Nf3", "Nf6", "g3", "g6"]);
  const variation = line(["g3", "g6", "Nf3", "Nf6"]);
  const tree = { startFen: START_FEN, children: [main, variation] };
  const mainEnd = currentHistoryKey(tree, [0, 0, 0, 0]);
  assert.equal(mainEnd, currentHistoryKey(tree, [1, 0, 0, 0]));
  assert.deepEqual(gameHistoryKeys(tree), [
    key(START_FEN), key(main.fen), currentHistoryKey(tree, [0, 0]), currentHistoryKey(tree, [0, 0, 0]), mainEnd,
    key(variation.fen), currentHistoryKey(tree, [1, 0]), currentHistoryKey(tree, [1, 0, 0]),
  ]);
});

test("caps history at 300 unique positions, reserving space for the mainline first", () => {
  const chess = new Chess(START_FEN);
  const root = line(["Nf3"]);
  const tree = { startFen: START_FEN, children: [root] };
  // Distinct position keys from legal piece placements, as a wide synthetic variation tree.
  const pawns = ["a", "b", "c", "d", "e", "f", "g", "h"];
  for (let mask = 0; mask < 512; mask++) {
    chess.load(START_FEN);
    pawns.forEach((file, index) => {
      if (mask & (1 << index)) chess.remove(`${file}2` as Parameters<Chess["remove"]>[0]);
    });
    if (mask & 256) chess.remove("a7");
    tree.children.push({ ...root, fen: chess.fen() });
  }
  const keys = gameHistoryKeys(tree);
  assert.equal(keys.length, 300);
  assert.equal(new Set(keys).size, 300);
  assert.deepEqual(keys.slice(0, 2), [key(START_FEN), key(root.fen)]);
});
