import assert from "node:assert/strict";
import { test } from "node:test";
import { parseMovesFromText } from "./parse-moves.ts";
import { START_FEN } from "./tree.ts";

const sans = (text: string, fen = START_FEN) => parseMovesFromText(text, fen).moves.map((m) => m.san);

test("parses numbered and bare SAN", () => {
  assert.deepEqual(sans("1. e4 e5 2. Nf3"), ["e4", "e5", "Nf3"]);
  assert.deepEqual(sans("e4 e5 Nf3 Nc6 Bb5"), ["e4", "e5", "Nf3", "Nc6", "Bb5"]);
  assert.deepEqual(sans("1.e4 e5 2.Nf3"), ["e4", "e5", "Nf3"]);
});

test("strips results, NAGs, comments and annotation marks", () => {
  assert.deepEqual(sans("1. e4! {best} e5 $1 2. Nf3?! 1-0"), ["e4", "e5", "Nf3"]);
});

test("handles black to move and ellipsis numbers", () => {
  const fen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
  assert.deepEqual(sans("1... e5 2. Nf3", fen), ["e5", "Nf3"]);
  assert.deepEqual(sans("1...e5", fen), ["e5"]);
});

test("returns uci, fen, from and to", () => {
  const [first] = parseMovesFromText("e4", START_FEN).moves;
  assert.equal(first.uci, "e2e4");
  assert.equal(first.from, "e2");
  assert.equal(first.to, "e4");
  assert.match(first.fen, /^rnbqkbnr\/pppppppp\/8\/8\/4P3/);
});

test("illegal first move yields nothing", () => {
  const result = parseMovesFromText("Nf6 e5", START_FEN);
  assert.equal(result.moves.length, 0);
  assert.equal(result.stop, "illegal");
});

test("stops at the first illegal token keeping the legal prefix", () => {
  const result = parseMovesFromText("1. e4 e5 2. Qh7 Nc6", START_FEN);
  assert.deepEqual(result.moves.map((m) => m.san), ["e4", "e5"]);
  assert.equal(result.stop, "illegal");
});

test("empty text and results-only text have no moves", () => {
  assert.equal(parseMovesFromText("   ", START_FEN).stop, "empty");
  assert.equal(parseMovesFromText("1-0", START_FEN).stop, "empty");
});

test("full PGN with headers is detected", () => {
  const result = parseMovesFromText('[Event "x"]\n[White "a"]\n\n1. e4 e5 *', START_FEN);
  assert.equal(result.fullPgn, true);
  assert.equal(result.moves.length, 0);
});
