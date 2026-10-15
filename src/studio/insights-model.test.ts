import assert from "node:assert/strict";
import test from "node:test";
import { computePositionFacts, compareThreats } from "../chess/facts/index.ts";
import {
  insightsLabel,
  insightsLabelKeys,
  insightsLangFrom,
} from "./insights-labels.ts";
import {
  buildConcepts,
  buildPieceRows,
  fileSquares,
  marksForThreat,
  marksForThreats,
  mergeBoardMarks,
} from "./insights-model.ts";

const MIDDLEGAME = "2rq1rk1/R2n1ppp/4p3/2pb4/5B2/6P1/1Q2PPBP/3R2K1 w - - 0 21";

test("labels exist for every key in both languages", () => {
  for (const key of insightsLabelKeys()) {
    assert.ok(insightsLabel("en", key).length > 0, `en ${key}`);
    assert.ok(insightsLabel("pt", key).length > 0, `pt ${key}`);
  }
  assert.notEqual(insightsLabel("en", "tabThreats"), insightsLabel("pt", "tabThreats"));
});

test("language follows the browser locale, defaulting to English", () => {
  assert.equal(insightsLangFrom("pt-BR"), "pt");
  assert.equal(insightsLangFrom("PT"), "pt");
  assert.equal(insightsLangFrom("en-US"), "en");
  assert.equal(insightsLangFrom(undefined), "en");
});

test("piece rows cover every piece, with their tags and highlight marks", () => {
  const facts = computePositionFacts(MIDDLEGAME);
  const rows = buildPieceRows(facts);
  assert.equal(rows.length, facts.pieces.length);
  const rook = rows.find((row) => row.square === "d1");
  assert.ok(rook);
  assert.ok(rook.tags.includes("xray"));
  assert.ok(rook.marks.squares.some((m) => m.square === "d1"));
  assert.ok(rook.marks.arrows.some((m) => m.from === "d1" && m.to === "d5" && m.color === "R"));
  assert.ok(rook.marks.arrows.some((m) => m.from === "d1" && m.to === "d7" && m.color === "B"));
});

test("threat marks draw the move in red and mark what is attacked", () => {
  const comparison = compareThreats(MIDDLEGAME, "b2a1");
  assert.ok(comparison);
  const threat = comparison.before.threats[0];
  assert.ok(threat);
  const marks = marksForThreat(threat);
  assert.ok(marks.arrows.some((a) => a.from === "d8" && a.to === "b6" && a.color === "R"));
  assert.ok(marks.arrows.some((a) => a.from === "b6" && a.to === "a7"));
  assert.deepEqual(marks.squares.map((s) => s.square).sort(), ["a7", "b2"]);
  assert.deepEqual(marksForThreats([]).arrows, []);
});

test("merged marks do not duplicate a square or an arrow", () => {
  const marks = mergeBoardMarks([
    { squares: [{ square: "e4", color: "R" }], arrows: [{ from: "e2", to: "e4", color: "R" }] },
    { squares: [{ square: "e4", color: "B" }], arrows: [{ from: "e2", to: "e4", color: "B" }] },
  ]);
  assert.equal(marks.squares.length, 1);
  assert.equal(marks.arrows.length, 1);
});

test("concepts list files, diagonals, 7th rank and pawn weaknesses with highlights", () => {
  const concepts = buildConcepts(computePositionFacts(MIDDLEGAME));
  const byId = new Map(concepts.map((item) => [item.id, item]));
  const dFile = byId.get("file:d");
  assert.equal(dFile?.label, "open-file");
  assert.equal(dFile?.marks.squares.length, 8);
  assert.deepEqual(fileSquares("d").slice(0, 2), ["d1", "d2"]);
  assert.equal(byId.get("seventh:w")?.label, "seventh-rank");
  assert.equal(byId.get("diagonal:a1h8")?.label, "long-diagonal");
  assert.equal(byId.get("pawn:isolated:c5")?.label, "isolated");
  assert.equal(byId.get("king:w")?.label, "castled");
  for (const item of concepts) {
    assert.ok(item.marks.squares.length + item.marks.arrows.length > 0, item.id);
  }
});

test("two skewers by the same slider get distinct concept ids", () => {
  const facts = computePositionFacts("r3k3/8/8/8/q7/6K1/8/R2q3r w - - 0 1");
  assert.equal(facts.skewers.length, 2);
  const ids = buildConcepts(facts).filter((item) => item.label === "skewer").map((item) => item.id);
  assert.equal(ids.length, 2);
  assert.equal(new Set(ids).size, 2);
});
