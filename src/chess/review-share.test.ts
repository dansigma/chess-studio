// SIG-968: unit tests for the pure review share-summary builder.
import assert from "node:assert/strict";
import test from "node:test";
import { buildReviewSummary } from "./review-share.ts";
import type { ReviewReport } from "./review-report.ts";
import { START_FEN } from "./tree.ts";

function report(): ReviewReport {
  const side = (name: string, rating: number | null) => ({
    name,
    rating,
    moves: 20,
    accuracy: 86,
    acpl: 42,
    gameRating: { value: 2450, anchored: rating != null },
    counts: {
      brilliant: 0,
      great: 0,
      best: 0,
      veryGood: 0,
      decent: 0,
      book: 0,
      inaccuracy: 1,
      mistake: 0,
      miss: 0,
      blunder: 1,
    },
    forced: 0,
    phases: { opening: 90, middlegame: 80, endgame: null },
  });
  return { white: side("Carlsen, Magnus", 2830), black: side("Nakamura, Hikaru", 2800) };
}

test("summary renders the EN shape: title, players, sides, moments", () => {
  const text = buildReviewSummary("en", {
    report: report(),
    moments: [
      { path: [0], san: "e4", side: "w", label: "inaccuracy" },
      { path: [0, 0, 1], san: "Nf3", side: "b", label: "blunder" },
    ],
    moveNotation: "english",
    startFen: START_FEN,
    openingName: "B01 · Scandinavian",
  });
  assert.ok(text.includes("Game review"), text);
  assert.ok(text.includes("B01 · Scandinavian"), text);
  assert.ok(text.includes("Carlsen, Magnus (2830) vs Nakamura, Hikaru (2800)"), text);
  assert.ok(text.includes("Accuracy 86.0"), text);
  assert.ok(text.includes("Avg. loss 42"), text);
  // Game rating label without the ⓘ tooltip marker used in the UI table.
  assert.ok(text.includes("Game rating 2,450"), text);
  assert.ok(!text.includes("ⓘ"), text);
  assert.ok(text.includes("1. e4 — Imprecise"), text);
  assert.ok(text.includes("2... Nf3 — Blunder"), text);
});

test("summary is localized through the whole-sentence tables", () => {
  const text = buildReviewSummary("pt-br", {
    report: report(),
    moments: [{ path: [0], san: "e4", side: "w", label: "blunder" }],
    moveNotation: "english",
    startFen: START_FEN,
  });
  assert.ok(text.includes("Análise da partida"), text);
  assert.ok(text.includes("Precisão 86,0"), text);
  assert.ok(text.includes("Perda média 42"), text);
  // Blunder renders as Capivarada, consistent with the panel tier name.
  assert.ok(text.includes("1. e4 — Capivarada"), text);
});

test("empty moments fall back to the no-mistakes copy", () => {
  const text = buildReviewSummary("en", {
    report: report(),
    moments: [],
    moveNotation: "english",
    startFen: START_FEN,
  });
  assert.ok(text.includes("No mistakes in this line."), text);
});
