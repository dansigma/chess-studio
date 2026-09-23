import assert from "node:assert/strict";
import test from "node:test";
import { Chess } from "chess.js";
import { repertoireMoves } from "./repertoire.ts";
import {
  createEmptyTree,
  fenKey,
  getFenAt,
  getNodeAt,
  playMove,
  type GameTree,
  type Path,
} from "./tree.ts";

function playSans(sans: string[], tree: GameTree = createEmptyTree(), path: Path = []): { tree: GameTree; path: Path } {
  let state = { tree, path };
  for (const san of sans) {
    const chess = new Chess(getFenAt(state.tree, state.path));
    const move = chess.move(san);
    if (!move) {
      throw new Error(`illegal ${san}`);
    }
    state = playMove(state.tree, state.path, {
      san: move.san,
      uci: `${move.from}${move.to}${move.promotion ?? ""}`,
      fen: chess.fen(),
      from: move.from,
      to: move.to,
    });
  }
  return state;
}

function transposedTree(otherReply: string): { tree: GameTree; path: Path } {
  const main = playSans(["e4", "e5", "Nf3", "Nc6"]);
  const other = playSans(["Nf3", "e5", "e4", otherReply], main.tree, []);
  return { tree: other.tree, path: main.path.slice(0, 3) };
}

test("two move orders into one position list both next moves", () => {
  const { tree, path } = transposedTree("Bc5");
  const moves = repertoireMoves(tree, path);
  assert.deepEqual(moves.map((move) => move.san), ["Nc6", "Bc5"]);
  assert.equal(fenKey(getFenAt(tree, path)), fenKey(getFenAt(tree, [1, 0, 0])));
});

test("the same next move is one row and the click stays on the current line", () => {
  const { tree, path } = transposedTree("Nc6");
  const moves = repertoireMoves(tree, path);
  assert.equal(moves.length, 1);
  assert.equal(moves[0]?.san, "Nc6");
  assert.deepEqual(moves[0]?.path, [...path, 0]);
});

test("a move that exists only on the other order uses that order", () => {
  const main = playSans(["e4", "e5", "Nf3"]);
  const { tree } = playSans(["Nf3", "e5", "e4", "Bc5"], main.tree, []);
  const moves = repertoireMoves(tree, main.path);
  assert.deepEqual(moves.map((move) => move.san), ["Bc5"]);
  assert.deepEqual(moves[0]?.path, [1, 0, 0, 0]);
});

test("a position that differs only by move number still matches", () => {
  const { tree, path } = transposedTree("Nc6");
  const other = getNodeAt(tree, [1, 0, 0]);
  if (!other) {
    throw new Error("missing transposition");
  }
  other.fen = other.fen.replace(/ \d+ \d+$/, " 9 9");
  other.children.push({
    id: "d6",
    san: "d6",
    uci: "d7d6",
    fen: other.fen,
    from: "d7",
    to: "d6",
    children: [],
  });
  const moves = repertoireMoves(tree, path);
  assert.deepEqual(moves.map((move) => move.san), ["Nc6", "d6"]);
  assert.deepEqual(moves[0]?.path, [...path, 0]);
});

test("a different piece placement is excluded", () => {
  const { tree } = transposedTree("Bc5");
  const moves = repertoireMoves(tree, [0]);
  assert.deepEqual(moves.map((move) => move.san), ["e5"]);
});
