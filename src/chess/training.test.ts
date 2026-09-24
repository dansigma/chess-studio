import assert from "node:assert/strict";
import test from "node:test";
import { Chess } from "chess.js";
import { trainingAttempt } from "./training.ts";
import { createEmptyTree, getFenAt, playMove, type GameTree, type Path } from "./tree.ts";

function playSans(sans: string[], tree: GameTree = createEmptyTree(), path: Path = []) {
  let state = { tree, path };
  for (const san of sans) {
    const chess = new Chess(getFenAt(state.tree, state.path));
    const move = chess.move(san);
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

test("a stored move returns its path", () => {
  const game = playSans(["e4", "e5"]);
  const before = game.tree.children.length;
  const result = trainingAttempt(game.tree, [], "e2e4");
  assert.deepEqual(result, { kind: "accepted", path: [0] });
  assert.equal(game.tree.children.length, before);
});

test("an unknown move is refused", () => {
  const game = playSans(["e4"]);
  assert.deepEqual(trainingAttempt(game.tree, [], "d2d4"), { kind: "refused" });
});

test("a stored black move is accepted", () => {
  const game = playSans(["e4", "e5"]);
  assert.deepEqual(trainingAttempt(game.tree, [0], "e7e5"), { kind: "accepted", path: [0, 0] });
});

test("each stored reply is accepted", () => {
  const game = playSans(["e4", "e5"]);
  const withC5 = playSans(["e4", "c5"], game.tree, []);
  assert.equal(trainingAttempt(withC5.tree, [0], "e7e5").kind, "accepted");
  assert.equal(trainingAttempt(withC5.tree, [0], "c7c5").kind, "accepted");
});

test("no stored moves is complete", () => {
  const game = playSans(["e4", "e5"]);
  assert.deepEqual(trainingAttempt(game.tree, [0, 0], "g1f3"), { kind: "complete" });
});
