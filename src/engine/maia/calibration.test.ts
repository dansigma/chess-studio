import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_POSITION } from "chess.js";
import { calibrateChances, resolveMaiaRun } from "./calibration";
import { MAIA_ELOS, clampMaiaElo } from "./protocol";

test("Maia rating snaps to the nearest band, with ties going higher", () => {
  assert.equal(clampMaiaElo(1500), 1800);
  assert.equal(clampMaiaElo(2099), 2000);
  assert.equal(clampMaiaElo(2100), 2200);
  assert.equal(clampMaiaElo(3000), 2600);
  assert.equal(clampMaiaElo(NaN), 2000);
  assert.equal(clampMaiaElo("2400"), 2000);
});

test("Maia resolves the model rating and draw calibration for each mode and band", () => {
  const expected = [
    { modelElo: 2300, drawBias: 0.529, drawSlope: 1.385 },
    { modelElo: 2500, drawBias: 0.540, drawSlope: 1.407 },
    { modelElo: 2700, drawBias: 0.398, drawSlope: 1.467 },
    { modelElo: 2900, drawBias: -0.665, drawSlope: 1.627 },
    { modelElo: 2900, drawBias: -0.448, drawSlope: 1.271 },
  ];
  for (const [index, elo] of MAIA_ELOS.entries()) {
    assert.deepEqual(resolveMaiaRun(elo, "classical"), expected[index]);
    assert.deepEqual(resolveMaiaRun(elo, "online"), { modelElo: elo, drawBias: 0, drawSlope: 0 });
  }
  assert.deepEqual(resolveMaiaRun(2100, "classical"), expected[2]);
});

const chances = { white: 0.5, draw: 0.1, black: 0.4 };

test("zero calibration preserves the raw chances", () => {
  assert.deepEqual(calibrateChances(chances, DEFAULT_POSITION, { drawBias: 0, drawSlope: 0 }), chances);
});

test("classical calibration normalizes chances and matches the starting position draw chance", () => {
  const { white, draw, black } = calibrateChances(chances, DEFAULT_POSITION, resolveMaiaRun(2000, "classical"));
  assert.ok(Math.abs(white + draw + black - 1) < 1e-12);
  assert.ok(Math.abs(draw - 0.4377682237496141) < 1e-12);
});

test("increasing the draw factor increases the normalized draw chance", () => {
  const lower = calibrateChances(chances, DEFAULT_POSITION, { drawBias: 0, drawSlope: 1 });
  const higher = calibrateChances(chances, DEFAULT_POSITION, { drawBias: 0, drawSlope: 2 });
  assert.ok(lower.draw > chances.draw);
  assert.ok(higher.draw > lower.draw);
});
