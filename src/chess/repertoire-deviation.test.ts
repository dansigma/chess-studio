// SIG-1040: fixtures built from small PGNs; both trees come from `importPgn`
// so the tests exercise the real import shape (main line = children[0] chain).
import assert from "node:assert/strict";
import test from "node:test";
import { importPgn } from "./pgn.ts";
import { createEmptyTree, fenKey, type GameTree } from "./tree.ts";
import {
  buildRepertoireIndex,
  deviationLabel,
  findDeviation,
  type DeviationEvent,
} from "./repertoire-deviation.ts";

function treeFromPgn(pgn: string): GameTree {
  const imported = importPgn(pgn);
  assert.equal(imported.warnings.length, 0, `PGN failed to import: ${imported.warnings}`);
  return imported.tree;
}

function deviationOf(repertoirePgn: string, gamePgn: string, userColor: "white" | "black") {
  return findDeviation({
    repertoire: treeFromPgn(repertoirePgn),
    game: treeFromPgn(gamePgn),
    userColor,
  });
}

const WHITE_REP = '1. e4 e5 2. Nf3 Nc6 *\n';

test("a white user move outside the repertoire is a user deviation", () => {
  const event = deviationOf(WHITE_REP, "1. e4 e5 2. Bc4 *\n", "white");
  assert.equal(event.kind, "user_deviation");
  assert.equal(event.ply, 3);
  assert.equal(event.playedUci, "f1c4");
  assert.equal(event.playedSan, "Bc4");
  assert.deepEqual(event.repertoireMoves, [{ uci: "g1f3", san: "Nf3" }]);
  assert.equal(deviationLabel(event), "2. Bc4");
});

test("an opponent novelty is an opponent gap, not a user deviation", () => {
  const event = deviationOf(WHITE_REP, "1. e4 c5 2. Nf3 *\n", "white");
  assert.equal(event.kind, "opponent_gap");
  assert.equal(event.ply, 2);
  assert.equal(event.playedUci, "c7c5");
  assert.equal(event.playedSan, "c5");
  assert.deepEqual(event.repertoireMoves, [{ uci: "e7e5", san: "e5" }]);
});

test("a transposed game that follows the repertoire is not a deviation", () => {
  const repertoire =
    '[Event "A"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 *\n\n[Event "B"]\n\n1. Nf3 e5 2. e4 Nc6 3. Bc4 *\n';
  // Same moves as repertoire B through 2...Nc6, then 3.Bb5 from repertoire A:
  // the after-2.e4 position matches the after-2.Nf3 position by fenKey, so the
  // walk passes through the transposition and finds Bb5 in the repertoire.
  const event = deviationOf(repertoire, "1. Nf3 e5 2. e4 Nc6 3. Bb5 *\n", "white");
  assert.deepEqual(event, { kind: "none" });
});

test("without the transposed line the same game deviates on move one", () => {
  const event = deviationOf(
    "1. e4 e5 2. Nf3 Nc6 3. Bb5 *\n",
    "1. Nf3 e5 2. e4 Nc6 3. Bb5 *\n",
    "white",
  );
  assert.equal(event.kind, "user_deviation");
  assert.equal(event.ply, 1);
  assert.deepEqual(event.repertoireMoves, [{ uci: "e2e4", san: "e4" }]);
});

test("an empty repertoire never contains the game's first position", () => {
  const event = findDeviation({
    repertoire: createEmptyTree(),
    game: treeFromPgn("1. e4 e5 *\n"),
    userColor: "white",
  });
  assert.equal(event.kind, "never_entered");
  assert.equal(event.ply, 1);
  assert.equal(event.playedUci, "e2e4");
  assert.equal(event.playedSan, "e4");
  assert.deepEqual(event.repertoireMoves, []);
  assert.equal(deviationLabel(event), "1. e4");
});

test("a game that outlasts the repertoire line reports line_ended", () => {
  const event = deviationOf("1. e4 e5 *\n", "1. e4 e5 2. Nf3 *\n", "white");
  assert.equal(event.kind, "line_ended");
  assert.equal(event.ply, 3);
  assert.equal(event.playedUci, "g1f3");
  assert.equal(event.playedSan, "Nf3");
  assert.deepEqual(event.repertoireMoves, []);
});

test("a game that stays inside the repertoire to the end reports none", () => {
  const event = deviationOf("1. e4 e5 2. Nf3 *\n", "1. e4 e5 2. Nf3 *\n", "white");
  assert.deepEqual(event, { kind: "none" });
  assert.equal(deviationLabel(event), "");
});

test("a black user deviating on their own move is a user deviation", () => {
  const event = deviationOf(WHITE_REP, "1. e4 e5 2. Nf3 Nf6 *\n", "black");
  assert.equal(event.kind, "user_deviation");
  assert.equal(event.ply, 4);
  assert.equal(event.playedUci, "g8f6");
  assert.equal(event.playedSan, "Nf6");
  assert.deepEqual(event.repertoireMoves, [{ uci: "b8c6", san: "Nc6" }]);
  assert.equal(deviationLabel(event), "2…Nf6");
});

test("a white novelty against a black repertoire is an opponent gap", () => {
  const event = deviationOf(WHITE_REP, "1. d4 d5 *\n", "black");
  assert.equal(event.kind, "opponent_gap");
  assert.equal(event.ply, 1);
  assert.deepEqual(event.repertoireMoves, [{ uci: "e2e4", san: "e4" }]);
});

test("a late black deviation labels with the fullmove number", () => {
  const repertoire = "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 *\n";
  const game = "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 O-O *\n";
  const event = deviationOf(repertoire, game, "black");
  assert.equal(event.kind, "user_deviation");
  assert.equal(event.ply, 14);
  assert.deepEqual(event.repertoireMoves, [{ uci: "d7d6", san: "d6" }]);
  assert.equal(deviationLabel(event), "7…O-O");
});

test("the index holds root moves and merges transposed positions by fenKey", () => {
  const repertoire = treeFromPgn(
    '[Event "A"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 *\n\n[Event "B"]\n\n1. Nf3 e5 2. e4 Nc6 3. Bc4 *\n',
  );
  const index = buildRepertoireIndex(repertoire);
  assert.deepEqual(index.get(fenKey(repertoire.startFen)), [
    { uci: "e2e4", san: "e4" },
    { uci: "g1f3", san: "Nf3" },
  ]);
  // After 2.Nf3 (line A) and after 2.e4 (line B) share one key; Nc6 was added
  // from both orders but appears once.
  const afterWhiteSecond = repertoire.children[0]?.children[0]?.children[0]?.fen;
  if (!afterWhiteSecond) {
    throw new Error("missing transposed position");
  }
  assert.deepEqual(index.get(fenKey(afterWhiteSecond)), [{ uci: "b8c6", san: "Nc6" }]);
  // After 2...Nc6 both 3.Bb5 (line A) and 3.Bc4 (line B) are repertoire moves.
  const afterBlackSecond = repertoire.children[0]?.children[0]?.children[0]?.children[0]?.fen;
  if (!afterBlackSecond) {
    throw new Error("missing transposed reply position");
  }
  assert.deepEqual(index.get(fenKey(afterBlackSecond)), [
    { uci: "f1b5", san: "Bb5" },
    { uci: "f1c4", san: "Bc4" },
  ]);
});

test("finding the deviation mutates neither tree", () => {
  const repertoire = treeFromPgn(
    '[Event "A"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 *\n\n[Event "B"]\n\n1. Nf3 e5 2. e4 Nc6 3. Bc4 *\n',
  );
  const game = treeFromPgn("1. e4 e5 2. Bc4 Nf6 *\n");
  const repertoireClone = structuredClone(repertoire);
  const gameClone = structuredClone(game);
  findDeviation({ repertoire, game, userColor: "white" });
  assert.deepEqual(repertoire, repertoireClone);
  assert.deepEqual(game, gameClone);
});

test("deviationLabel is empty when there is no played move", () => {
  const none: DeviationEvent = { kind: "none" };
  assert.equal(deviationLabel(none), "");
});
