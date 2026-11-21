import assert from "node:assert/strict";
import { test } from "node:test";
import { importPgn } from "./pgn";
import { applyMerge, planMerge } from "./repertoire-merge";
import { fenKey, getNodeAt } from "./tree";

function pgn(moves: string) {
  const { tree, warnings } = importPgn(moves);
  assert.deepEqual(warnings, []);
  return tree;
}

test("adds opponent branches, counts new leaves, and skips duplicate lines", () => {
  const repertoire = pgn("1. e4 e5 2. Nf3");
  const book = pgn("1. e4 e5 (1... c5 2. Nf3) (1... e6 2. d4) 2. Nf3 Nc6");
  assert.deepEqual(planMerge(repertoire, book, "white"), { conflicts: [], newLines: 3 });
  const { tree, addedLines, keptConflicts } = applyMerge(repertoire, book, "white", {});
  assert.deepEqual(tree.children[0].children.map(({ san }) => san), ["e5", "c5", "e6"]);
  assert.equal(getNodeAt(tree, [0, 0, 0, 0])?.san, "Nc6");
  assert.equal(getNodeAt(repertoire, [0, 0, 0, 0]), null);
  assert.notEqual(getNodeAt(tree, [0, 0, 0, 0])?.id, getNodeAt(book, [0, 0, 0, 0])?.id);
  assert.deepEqual({ addedLines, keptConflicts }, { addedLines: 3, keptConflicts: 0 });
  assert.deepEqual(applyMerge(tree, book, "white", {}), { tree, addedLines: 0, keptConflicts: 0 });
});

test("merges at a transposition and derives the new FEN clocks from the destination", () => {
  const repertoire = pgn("1. Nf3 d5 2. d4 Nf6 (2... e6)");
  const book = pgn("1. d4 d5 2. Nf3 Nf6 3. Nc3");
  const { tree, addedLines, keptConflicts } = applyMerge(repertoire, book, "black", {});
  assert.equal(keptConflicts, 0);
  assert.equal(addedLines, 1);
  assert.equal(getNodeAt(tree, [0, 0, 0, 0, 0])?.san, "Nc3");
  assert.equal(getNodeAt(tree, [0, 0, 0, 0, 0])?.fen.split(" ")[4], "2");
  assert.equal(getNodeAt(book, [0, 0, 0, 0, 0])?.fen.split(" ")[4], "3");
  assert.equal(getNodeAt(tree, [1, 0, 0])?.children.length, 0);
  assert.equal(applyMerge(tree, book, "black", {}).addedLines, 0);
});

test("keeps the existing move by default and only promotes the accepted book continuation", () => {
  const repertoire = pgn("1. e4 e5 (1... c5 2. Nc3 d6) 2. Nf3");
  const book = pgn("1. e4 c5 2. Nf3 d6 3. d4");
  const { conflicts, newLines } = planMerge(repertoire, book, "white");
  assert.equal(newLines, 1);
  assert.deepEqual(conflicts.map(({ moveNumber, mineUci, mineSan, bookUci, bookSan }) => ({
    moveNumber, mineUci, mineSan, bookUci, bookSan,
  })), [{ moveNumber: 2, mineUci: "b1c3", mineSan: "Nc3", bookUci: "g1f3", bookSan: "Nf3" }]);
  assert.deepEqual(applyMerge(repertoire, book, "white", {}), {
    tree: repertoire, addedLines: 0, keptConflicts: 1,
  });

  const { tree, addedLines, keptConflicts } = applyMerge(repertoire, book, "white", {
    [fenKey(conflicts[0].fen)]: "book",
  });
  assert.equal(getNodeAt(tree, [0, 0])?.san, "e5");
  assert.equal(getNodeAt(tree, [0, 1, 0, 0, 0])?.san, "d4");
  assert.deepEqual(getNodeAt(tree, [0, 1, 1]), getNodeAt(repertoire, [0, 1, 0]));
  assert.deepEqual({ addedLines, keptConflicts }, { addedLines: 1, keptConflicts: 0 });
});
