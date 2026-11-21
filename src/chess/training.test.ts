import assert from "node:assert/strict";
import test from "node:test";
import { Chess } from "chess.js";
import { importPgn } from "./pgn.ts";
import { repertoireMoveKey, scheduleReview } from "./repertoire.ts";
import { pickOpponentReply, trainingAttempt, trainingColor } from "./training.ts";
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

test("training uses the repertoire mark before falling back to orientation", () => {
  assert.equal(trainingColor({ repertoireColor: "black", orientation: "white" }), "b");
  assert.equal(trainingColor({ repertoireColor: "white", orientation: "black" }), "w");
  assert.equal(trainingColor({ repertoireColor: null, orientation: "black" }), "b");
  assert.equal(trainingColor({ orientation: "white" }), "w");
});

test("a forced reply advances to its child and a finished line has no reply", () => {
  const { tree } = importPgn("1. e4 *");
  assert.deepEqual(pickOpponentReply(tree, [], {}), [0]);
  assert.equal(pickOpponentReply(tree, [0], {}), null);
});

test("reply selection prefers due user moves and randomizes equally due branches", () => {
  const { tree } = importPgn("1. e4 e5 (1... c5 2. Nf3) 2. Nf3 Nc6 3. Bb5 *");
  const reviewed = scheduleReview(undefined, true);
  const bb5 = repertoireMoveKey(getFenAt(tree, [0, 0, 0, 0]), "f1b5");
  const nf3 = repertoireMoveKey(getFenAt(tree, [0, 0]), "g1f3");

  assert.deepEqual(pickOpponentReply(tree, [0], {}, () => 0.99), [0, 0]);
  assert.deepEqual(pickOpponentReply(tree, [0], { [bb5]: reviewed, [nf3]: reviewed }, () => 0), [0, 1]);

  // With Bb5 reviewed, each branch has one due user move despite Nc6 still being unreviewed.
  let seed = 2;
  const rng = () => {
    seed = (seed * 2) % 7;
    return seed / 7;
  };
  const progress = { [bb5]: reviewed };
  assert.deepEqual(pickOpponentReply(tree, [0], progress, rng), [0, 1]);
  assert.deepEqual(pickOpponentReply(tree, [0], progress, rng), [0, 0]);
});
