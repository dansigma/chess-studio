import assert from "node:assert/strict";
import test from "node:test";
import { importPgn, mainlinePathForPgn, openablePgn } from "./pgn.ts";
import { repertoireMoves } from "./repertoire.ts";

test("a normal game opens with its moves", () => {
  const game = importPgn('[Event "A"]\n\n1. e4 e5 2. Nf3 *\n');
  assert.equal(game.tree.children[0]?.san, "e4");
  assert.equal(game.tree.children[0]?.children[0]?.san, "e5");
});

test("a percent comment does not block the game", () => {
  const game = importPgn("% note.\n[Event \"A\"]\n\n1. e4 e5 *\n");
  assert.equal(game.tree.children[0]?.san, "e4");
});

test("every game in a file is a line in the same repertoire", () => {
  const game = importPgn(
    '[Event "A"]\n\n1. e4 e5 *\n\n[Event "B"]\n\n1. d4 d5 *\n\n[Event "C"]\n\n1. e4 c5 *\n',
  );
  const atStart = repertoireMoves(game.tree, []).map((move) => move.san);
  assert.deepEqual(atStart, ["e4", "d4"]);
  const afterE4 = repertoireMoves(game.tree, [0]).map((move) => move.san);
  assert.deepEqual(afterE4, ["e5", "c5"]);
  const second = mainlinePathForPgn(game.tree, '[Event "B"]\n\n1. d4 d5 *\n');
  assert.deepEqual(second, [1, 0]);
});

test("a unicode ellipsis still opens both moves", () => {
  const game = importPgn("1. e4 1\u2026 e5 *");
  assert.equal(game.tree.children[0]?.san, "e4");
  assert.equal(game.tree.children[0]?.children[0]?.san, "e5");
});

test("a period where a move was expected does not throw", () => {
  assert.doesNotThrow(() => importPgn("1. e4 1.. . e5 *"));
  const game = importPgn("1. e4 e5 2. Nf3 .... *");
  assert.equal(game.tree.children[0]?.san, "e4");
  assert.equal(openablePgn("this is not. a pgn"), null);
});
