import assert from "node:assert/strict";
import { test } from "node:test";
import { groupSearchResults, lineMovesFrom } from "./group-search-results.ts";

const main = { eco: "D01", name: "Rapport-Jobava System", uci: ["d2d4", "d7d5", "b1c3", "g8f6", "c1f4"] };
const e6 = { ...main, uci: [...main.uci, "e7e6"] };
const g6 = { ...main, uci: [...main.uci, "g7g6", "e2e3", "f8g7"] };
const withE6 = { ...main, name: "Rapport-Jobava System, with e6", uci: ["d2d4", "d7d5", "b1c3", "e7e6", "c1f4"] };

test("groups exact names by best rank and puts the shared main line first", () => {
  const results = [e6, withE6, g6, main];
  assert.deepEqual(groupSearchResults(results, "en"), [
    { name: main.name, lines: [main, e6, g6], prefixLength: 5 },
    { name: withE6.name, lines: [withE6], prefixLength: 5 },
  ]);
  assert.deepEqual(results, [e6, withE6, g6, main]);
});

test("groups by the localized display name and finds the common prefix across all lines", () => {
  const defense = { eco: "B20", name: "Sicilian Defense", uci: ["e2e4", "c7c5", "g1f3"] };
  const defence = { eco: "B21", name: "Sicilian Defence", uci: ["e2e4", "c7c5", "d2d4"] };
  const translated = { ...defence, name: "Defesa Siciliana", uci: ["e2e4", "c7c6"] };
  assert.deepEqual(groupSearchResults([defense, defence, translated], "pt-br"), [
    { name: "Defesa Siciliana", lines: [defense, defence, translated], prefixLength: 1 },
  ]);
  assert.equal(groupSearchResults([defense, defence, translated], "en").length, 3);
});

test("formats SAN suffixes with numbering from the initial position", () => {
  assert.equal(lineMovesFrom(main), "1. d4 d5 2. Nc3 Nf6 3. Bf4");
  assert.equal(lineMovesFrom(g6, 5), "3... g6 4. e3 Bg7");
  assert.equal(lineMovesFrom(g6, 6), "4. e3 Bg7");
});
