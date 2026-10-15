import assert from "node:assert/strict";
import test from "node:test";
import { playerAccuracy, volatilityWeights, volatilityWindow, whiteWinChance } from "./review-accuracy.ts";

test("the window is ceil(moves/10) clamped to 2..8", () => {
  assert.equal(volatilityWindow(0), 2);
  assert.equal(volatilityWindow(15), 2);
  assert.equal(volatilityWindow(45), 5);
  assert.equal(volatilityWindow(200), 8);
});

test("mate scores map to 100 / 0 win chance and cp scores are clamped", () => {
  assert.equal(whiteWinChance(9990), 100);
  assert.equal(whiteWinChance(-9990), 0);
  assert.equal(whiteWinChance(0), 50);
  assert.equal(whiteWinChance(30), whiteWinChance(10));
});

test("a flat game gets the minimum weight everywhere", () => {
  const weights = volatilityWeights(Array.from({ length: 21 }, () => 50));
  assert.equal(weights.length, 20);
  assert.ok(weights.every((weight) => weight === 0.5));
});

test("a swing raises the weights of the moves around it, capped at 12", () => {
  const chances = [...Array.from({ length: 10 }, () => 50), ...Array.from({ length: 11 }, () => 100)];
  const weights = volatilityWeights(chances);
  assert.equal(weights.length, 20);
  assert.equal(weights[0], 0.5);
  assert.equal(weights[19], 0.5);
  assert.equal(Math.max(...weights), 12);
  assert.ok(weights[9] > weights[2]);
});

test("short or empty games produce no weights", () => {
  assert.deepEqual(volatilityWeights([]), []);
  assert.deepEqual(volatilityWeights([50]), []);
  assert.deepEqual(volatilityWeights([50, 60]).length, 1);
});

test("no samples means no accuracy", () => {
  assert.equal(playerAccuracy([]), null);
});

test("all-perfect play is 100 and all-blunder play is very low", () => {
  assert.equal(playerAccuracy(Array.from({ length: 10 }, () => ({ accuracy: 100, weight: 3 }))), 100);
  const bad = playerAccuracy(Array.from({ length: 10 }, () => ({ accuracy: 0, weight: 3 })));
  assert.equal(bad, 5);
});

test("weights default to 1 and equal weights reduce to mean-of-means for uniform play", () => {
  assert.equal(playerAccuracy([{ accuracy: 80 }, { accuracy: 80 }]), 80);
});

test("a blunder on a volatile move costs more than on a quiet one", () => {
  const volatile = playerAccuracy([
    { accuracy: 100, weight: 0.5 },
    { accuracy: 20, weight: 12 },
  ]);
  const quiet = playerAccuracy([
    { accuracy: 100, weight: 12 },
    { accuracy: 20, weight: 0.5 },
  ]);
  assert.ok((volatile ?? 0) < (quiet ?? 0));
});

test("known sequence: weighted and harmonic means are averaged", () => {
  // weighted = (100*1 + 50*3) / 4 = 62.5 ; harmonic = 2 / (1/100 + 1/50) = 66.667
  assert.equal(playerAccuracy([{ accuracy: 100, weight: 1 }, { accuracy: 50, weight: 3 }]), 64.6);
});

test("the harmonic part floors move accuracies at 10", () => {
  // weighted = 5 ; harmonic = 10 (floored) -> 7.5
  assert.equal(playerAccuracy([{ accuracy: 5, weight: 1 }]), 7.5);
});
