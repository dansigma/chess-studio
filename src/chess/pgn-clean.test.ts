import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCompactPgn,
  numberSanLine,
  pgnForImport,
  pgnGameChunks,
  sanLineFromPgn,
  sanMovesFromPgn,
  stripPgnDiagnostics,
  stripPgnNoise,
} from "./pgn-clean.ts";

test("pgnForImport strips BOM, %-lines, ellipsis and clock tags", () => {
  const raw =
    "[White \"A\"]\n%engine line to drop\n1. e4 … e5 {[ %clk 0:01:00 ]} 1-0";
  const cleaned = pgnForImport(raw);
  assert.ok(!cleaned.includes("%engine"));
  assert.ok(!cleaned.includes("[%clk"));
  assert.ok(!cleaned.includes("…"));
  assert.ok(cleaned.includes("..."));
  assert.ok(cleaned.includes('[White "A"]'));
});

test("pgnGameChunks splits multi-game text and handles empty input", () => {
  assert.deepEqual(pgnGameChunks(""), []);
  assert.deepEqual(pgnGameChunks("   \n  "), []);
  const two =
    '[White "A"]\n\n1. e4 e5 *\n\n[White "B"]\n\n1. d4 d5 *\n';
  const chunks = pgnGameChunks(two);
  assert.equal(chunks.length, 2);
  assert.ok(chunks[0]?.includes('"A"'));
  assert.ok(chunks[1]?.includes('"B"'));
});

test("stripPgnDiagnostics removes clock annotations and collapses space", () => {
  const out = stripPgnDiagnostics("1. e4 {[%clk 0:01]}   e5 [%clk 0:02]");
  assert.equal(out, "1. e4 e5");
  assert.equal(stripPgnDiagnostics("  padded  "), "padded");
});

test("stripPgnNoise removes comments, semicolon notes, NAGs and variations", () => {
  const noisy =
    '1. e4 {a comment} e5 ;trailing note\n2. Nf3 $1 (2... Nc6 {nested (deep)}) 2... d6 *';
  const stripped = stripPgnNoise(noisy);
  assert.ok(!stripped.includes("comment"));
  assert.ok(!stripped.includes("trailing"));
  assert.ok(!stripped.includes("$1"));
  assert.ok(!stripped.includes("Nc6"));
  assert.ok(stripped.includes("Nf3"));
});

test("stripPgnNoise removes nested variations", () => {
  const stripped = stripPgnNoise("1. e4 (1. d4 (1. c4)) e5 *");
  assert.ok(!stripped.includes("d4"));
  assert.ok(!stripped.includes("c4"));
  assert.ok(stripped.includes("e4"));
});

test("sanMovesFromPgn drops numbers, results and annotation suffixes", () => {
  const moves = sanMovesFromPgn("1. e4! e5? 2. Nf3 1-0");
  assert.deepEqual(moves, ["e4", "e5", "Nf3"]);
  assert.deepEqual(sanMovesFromPgn('[White "A"]\n\n*'), []);
});

test("sanLineFromPgn joins moves with spaces", () => {
  assert.equal(sanLineFromPgn("1. e4 e5 2. Nf3 *"), "e4 e5 Nf3");
});

test("numberSanLine numbers white moves from 1", () => {
  assert.equal(numberSanLine("e4 e5 Nf3 Nc6"), "1. e4 e5 2. Nf3 Nc6");
  assert.equal(numberSanLine(""), "");
  assert.equal(numberSanLine("e4"), "1. e4");
});

test("buildCompactPgn quotes headers and falls back to * result", () => {
  const pgn = buildCompactPgn({ White: "A", Black: "B" }, "e4 e5");
  assert.ok(pgn.includes('[White "A"]'));
  assert.ok(pgn.includes("1. e4 e5 *"));
  const quoted = buildCompactPgn({ White: 'Say "Hi"' }, "");
  assert.ok(quoted.includes('Say \\"Hi\\"'));
  assert.ok(quoted.endsWith("*\n"));
  const withResult = buildCompactPgn({ Result: "1-0" }, "e4");
  assert.ok(withResult.trimEnd().endsWith("1-0"));
});
