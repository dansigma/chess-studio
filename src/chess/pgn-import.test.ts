import assert from "node:assert/strict";
import test from "node:test";
import { importPgn, mainlinePathForPgn, openListedFileGame, openablePgn } from "./pgn.ts";
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

test("a game that starts from a FEN keeps that position and its comment", () => {
  const fen = "r1bq1rk1/pp3ppp/2n1pn2/2pp4/2P5/2NP1N2/PP2BPPP/R1BQ1RK1 w - - 0 8";
  const pgn = `[White "Isidor Gunsberg"]\n[Black "Mikhail Chigorin"]\n[FEN "${fen}"]\n[SetUp "1"]\n\n{Chigorin is better.} 8. d4 *\n`;
  const game = importPgn(pgn);
  assert.equal(game.tree.startFen, fen);
  assert.equal(game.tree.startComment, "Chigorin is better.");
  assert.equal(game.tree.children[0]?.san, "d4");
});

test("choosing a chapter keeps its own position and comment", () => {
  const fen = "r1bq1rk1/pp3ppp/2n1pn2/2pp4/2P5/2NP1N2/PP2BPPP/R1BQ1RK1 w - - 0 8";
  const chapter = `[White "Isidor Gunsberg"]\n[Black "Mikhail Chigorin"]\n[FEN "${fen}"]\n[SetUp "1"]\n\n{Chigorin is better.} 8. d4 *\n`;
  const file = `[Event "Welcome"]\n\n{Welcome to the course.} 1. d4 *\n\n${chapter}`;
  const opened = openListedFileGame(file, chapter);
  assert.ok(opened);
  assert.equal(opened.tree.startFen, fen);
  assert.equal(opened.tree.startComment, "Chigorin is better.");
  assert.deepEqual(opened.path, []);
  assert.equal(opened.headers.White, "Isidor Gunsberg");
});

test("a period where a move was expected does not throw", () => {
  assert.doesNotThrow(() => importPgn("1. e4 1.. . e5 *"));
  const game = importPgn("1. e4 e5 2. Nf3 .... *");
  assert.equal(game.tree.children[0]?.san, "e4");
  assert.equal(openablePgn("this is not. a pgn"), null);
});

test("a null move inside a variation is kept with -- SAN", () => {
  const game = importPgn('[Event "A"]\n\n1. e4 e5 (1... -- 2. Nf3) *\n');
  assert.equal(game.tree.children[0]?.san, "e4");
  const variation = game.tree.children[0]?.children[1];
  assert.ok(variation, "expected a second variation after 1... e5");
  assert.equal(variation.san, "--");
  assert.equal(variation.uci, "0000");
  assert.equal(variation.children[0]?.san, "Nf3");
});

test("an illegal SAN stops the line and is recorded, keeping the parsed prefix", () => {
  const game = importPgn('[Event "A"]\n\n1. e4 e5 2. e5 *\n');
  assert.equal(game.tree.children[0]?.san, "e4");
  assert.equal(game.tree.children[0]?.children[0]?.san, "e5");
  assert.equal(game.tree.children[0]?.children[0]?.children.length, 0);
  assert.ok(Array.isArray(game.warnings));
  assert.equal(game.warnings.length, 1);
  assert.match(game.warnings[0] ?? "", /e5/);
});

test("an unplayable first move still records a warning instead of failing silently", () => {
  const game = importPgn('[Event "F"]\n\n1... e5 *\n');
  assert.equal(game.tree.children.length, 0);
  assert.ok(game.warnings.length >= 1, "expected the skipped move to be recorded");
  assert.match(game.warnings[0] ?? "", /e5/);
});

test("an unplayable move from a declared FEN keeps the declared position", () => {
  const fen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1";
  const game = importPgn(`[Event "F"]\n[FEN "${fen}"]\n[SetUp "1"]\n\n1. d4 *\n`);
  assert.equal(game.tree.children.length, 0);
  assert.ok(game.warnings.length >= 1, "expected the skipped move to be recorded");
  assert.equal(game.tree.startFen, fen);
});

test("warnings from a dropped game survive a multi-game merge", () => {
  const merged = openablePgn('[Event "bad"]\n\n1. Ke2 *\n\n[Event "good"]\n\n1. e4 *\n');
  assert.ok(merged);
  assert.equal(merged.tree.children[0]?.san, "e4");
  assert.ok(merged.warnings.length >= 1, "expected the bad game's warning to survive the merge");
  assert.match(merged.warnings[0] ?? "", /Ke2/);
});

test("merging games fills an empty pre-game comment but never overwrites", () => {
  const merged = openablePgn('[Event "A"]\n\n1. e4 *\n\n[Event "B"]\n\n{startB} 1. e4 *\n');
  assert.ok(merged);
  assert.equal(merged.tree.startComment, "startB");
  const keepFirst = openablePgn('[Event "A"]\n\n{startA} 1. e4 *\n\n[Event "B"]\n\n{startB} 1. e4 *\n');
  assert.ok(keepFirst);
  assert.equal(keepFirst.tree.startComment, "startA");
});
