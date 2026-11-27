import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_POSITION } from "chess.js";
import {
  MIN_COMBINED_DEPTH,
  calibrateChances,
  combinedChances,
  resolveMaiaChances,
  resolveMaiaRun,
} from "./calibration";
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

test("combinedChances sums to 1, clamps extremes, and matches Python parity for band 1800", () => {
  const parity = combinedChances({ white: 0.5, draw: 0.3, black: 0.2 }, 150, DEFAULT_POSITION, 1800);
  assert.ok(Math.abs(parity.white + parity.draw + parity.black - 1) < 1e-12);
  assert.ok(Math.abs(parity.white - 0.32491736608481) < 1e-12);
  assert.ok(Math.abs(parity.draw - 0.5742372234909096) < 1e-12);
  assert.ok(Math.abs(parity.black - 0.10084541042428047) < 1e-12);

  for (const elo of MAIA_ELOS) {
    const whiteMate = combinedChances(chances, 1000, DEFAULT_POSITION, elo);
    assert.ok(Math.abs(whiteMate.white + whiteMate.draw + whiteMate.black - 1) < 1e-12);
    assert.ok(whiteMate.white > 0.7 && whiteMate.white > whiteMate.draw && whiteMate.white > whiteMate.black,
      `expected strong white win at +1000 for ${elo}, got ${whiteMate.white}`);

    const blackMate = combinedChances(chances, -1000, DEFAULT_POSITION, elo);
    assert.ok(Math.abs(blackMate.white + blackMate.draw + blackMate.black - 1) < 1e-12);
    assert.ok(blackMate.black > 0.7 && blackMate.black > blackMate.draw && blackMate.black > blackMate.white,
      `expected strong black win at -1000 for ${elo}, got ${blackMate.black}`);
  }

  // Scores beyond +-1000 (e.g. mate encoded as +-10000 pawns) clamp to +-1000 cp.
  assert.deepEqual(
    combinedChances(chances, 999900, DEFAULT_POSITION, 2000),
    combinedChances(chances, 1000, DEFAULT_POSITION, 2000),
  );
  assert.deepEqual(
    combinedChances(chances, -999900, DEFAULT_POSITION, 2000),
    combinedChances(chances, -1000, DEFAULT_POSITION, 2000),
  );

  // Zero probabilities are clipped safely without producing NaN.
  const zeroSafe = combinedChances({ white: 1, draw: 0, black: 0 }, 0, DEFAULT_POSITION, 2100);
  assert.ok(Number.isFinite(zeroSafe.white) && Number.isFinite(zeroSafe.draw) && Number.isFinite(zeroSafe.black));
  assert.ok(Math.abs(zeroSafe.white + zeroSafe.draw + zeroSafe.black - 1) < 1e-12);
});

test("resolveMaiaChances uses combined model only when classical, active, and depth >= 14", () => {
  const fallback = calibrateChances(chances, DEFAULT_POSITION, resolveMaiaRun(2000, "classical"));
  const combined = combinedChances(chances, 150, DEFAULT_POSITION, 2000);

  assert.equal(MIN_COMBINED_DEPTH, 14);
  assert.deepEqual(
    resolveMaiaChances(chances, DEFAULT_POSITION, "classical", 2000, { pawns: 1.5, depth: 14 }, true),
    combined,
  );
  assert.deepEqual(
    resolveMaiaChances(chances, DEFAULT_POSITION, "classical", 2000, { pawns: 1.5, depth: 13 }, true),
    fallback,
  );
  assert.deepEqual(
    resolveMaiaChances(chances, DEFAULT_POSITION, "classical", 2000, null, true),
    fallback,
  );
  assert.deepEqual(
    resolveMaiaChances(chances, DEFAULT_POSITION, "classical", 2000, { pawns: 1.5, depth: 20 }, false),
    fallback,
  );
  assert.deepEqual(
    resolveMaiaChances(chances, DEFAULT_POSITION, "online", 2000, { pawns: 1.5, depth: 20 }, true),
    chances,
  );
});
