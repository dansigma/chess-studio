import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { MAIA_CLASSICAL_CALIBRATION } from "./classical-calibration.ts";

const EXPECTED_FEATURE_COUNT = 7;

type CombinedBandRow = {
  elo: number;
  modelElo: number;
  white: readonly number[];
  black: readonly number[];
};

function assertValidCombinedCalibration(rows: readonly CombinedBandRow[]): void {
  assert.deepEqual(
    rows.map(({ elo }) => elo),
    [1800, 2000, 2200, 2400, 2600],
  );

  for (const [index, row] of rows.entries()) {
    const classical = MAIA_CLASSICAL_CALIBRATION[index];
    assert.ok(classical, `Missing classical calibration row at index ${index}`);
    assert.equal(row.elo, classical.elo, `Band ${row.elo} elo mismatch`);
    assert.equal(
      row.modelElo,
      classical.modelElo,
      `Band ${row.elo} modelElo must match classical-calibration.ts`,
    );
    assert.equal(
      row.white.length,
      EXPECTED_FEATURE_COUNT,
      `Band ${row.elo} white coefficients must have length ${EXPECTED_FEATURE_COUNT}`,
    );
    assert.equal(
      row.black.length,
      EXPECTED_FEATURE_COUNT,
      `Band ${row.elo} black coefficients must have length ${EXPECTED_FEATURE_COUNT}`,
    );
    for (const coeff of [...row.white, ...row.black]) {
      assert.ok(Number.isFinite(coeff), `Band ${row.elo} has non-finite coefficient: ${coeff}`);
    }
  }
}

const FIXTURE: readonly CombinedBandRow[] = [
  { elo: 1800, modelElo: 2300, white: [0.5, -0.1, 1.2, 0.3, -0.2, 0.1, -0.4], black: [-0.1, 0.5, -1.2, 0.3, 0.2, 0.1, -0.4] },
  { elo: 2000, modelElo: 2500, white: [0.5, -0.1, 1.3, 0.3, -0.2, 0.1, -0.5], black: [-0.1, 0.5, -1.3, 0.3, 0.2, 0.1, -0.5] },
  { elo: 2200, modelElo: 2700, white: [0.5, -0.1, 1.4, 0.3, -0.2, 0.1, -0.6], black: [-0.1, 0.5, -1.4, 0.3, 0.2, 0.1, -0.6] },
  { elo: 2400, modelElo: 2900, white: [0.5, -0.1, 1.5, 0.3, -0.2, 0.1, -0.7], black: [-0.1, 0.5, -1.5, 0.3, 0.2, 0.1, -0.7] },
  { elo: 2600, modelElo: 2900, white: [0.5, -0.1, 1.6, 0.3, -0.2, 0.1, -0.8], black: [-0.1, 0.5, -1.6, 0.3, 0.2, 0.1, -0.8] },
];

test("Maia combined calibration validator accepts expected table shape", () => {
  assertValidCombinedCalibration(FIXTURE);
});

test("Maia combined calibration covers all rating bands when generated", async () => {
  const generatedPath = new URL("./classical-combined.ts", import.meta.url);
  if (!existsSync(generatedPath)) return;

  const moduleSpecifier = "./classical-combined.ts";
  const mod = (await import(moduleSpecifier)) as {
    MAIA_COMBINED_FEATURES?: readonly string[];
    MAIA_COMBINED_CALIBRATION?: readonly CombinedBandRow[];
  };
  assert.ok(Array.isArray(mod.MAIA_COMBINED_FEATURES), "Missing MAIA_COMBINED_FEATURES");
  assert.equal(mod.MAIA_COMBINED_FEATURES.length, EXPECTED_FEATURE_COUNT);
  assert.ok(Array.isArray(mod.MAIA_COMBINED_CALIBRATION), "Missing MAIA_COMBINED_CALIBRATION");
  assertValidCombinedCalibration(mod.MAIA_COMBINED_CALIBRATION);
});
