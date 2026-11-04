// SIG-1208: one-line key-moment row formatting.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatMomentEval,
  momentBestLabel,
  momentBestSan,
  momentNumberLabel,
} from "./key-moment-format.ts";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
// 1.e4 e5 2.Nf3 Nc6 3.Bb5 a6 4.Ba4 Nf6 5.O-O — Black to move? (position after 1.e4 e5 2.Nf3: black)
const AFTER_E4_E5_NF3 = "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2";

test("formatMomentEval signs the value and follows the locale decimals", () => {
  assert.equal(formatMomentEval("en", 0.34), "+0.3");
  assert.equal(formatMomentEval("en", -2.14), "-2.1");
  assert.equal(formatMomentEval("pt-br", 1.5), "+1,5");
  assert.equal(formatMomentEval("pt-br", -0.7), "-0,7");
});

test("formatMomentEval shows zero unsigned, including values that round to zero", () => {
  assert.equal(formatMomentEval("en", 0), "0.0");
  assert.equal(formatMomentEval("en", -0.04), "0.0");
  assert.equal(formatMomentEval("pt-br", 0.03), "0,0");
});

test("formatMomentEval shows mate scores as +M / -M", () => {
  assert.equal(formatMomentEval("en", 900), "+M");
  assert.equal(formatMomentEval("en", -900), "-M");
});

test("momentBestSan returns the engine's first move as SAN", () => {
  assert.equal(momentBestSan(START, "a2a3", ["e2e4", "e7e5"]), "e4");
  assert.equal(momentBestSan(AFTER_E4_E5_NF3, "a7a6", ["b8c6", "f1b5"]), "Nc6");
});

test("momentBestSan is null when the best move was played, missing or illegal", () => {
  assert.equal(momentBestSan(START, "e2e4", ["e2e4", "e7e5"]), null);
  assert.equal(momentBestSan(START, "e2e4", []), null);
  assert.equal(momentBestSan(START, "a2a3", ["e7e5"]), null);
});

test("momentBestLabel localizes the label and applies the move notation", () => {
  assert.equal(momentBestLabel("en", "english", "w", "Nd5"), "best: Nd5");
  assert.equal(momentBestLabel("pt-br", "english", "w", "Nd5"), "melhor: Nd5");
  assert.equal(momentBestLabel("en", "english", "w", null), null);
});

test("momentNumberLabel uses one dot for White and three for Black", () => {
  assert.equal(momentNumberLabel(14, "w"), "14.");
  assert.equal(momentNumberLabel(14, "b"), "14...");
});
