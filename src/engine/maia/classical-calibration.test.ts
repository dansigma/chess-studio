import assert from "node:assert/strict";
import { test } from "node:test";
import { MAIA_CLASSICAL_CALIBRATION } from "./classical-calibration.ts";

test("Maia classical calibration covers all rating bands with valid parameters", () => {
  assert.deepEqual(
    MAIA_CLASSICAL_CALIBRATION.map(({ elo }) => elo),
    [1800, 2000, 2200, 2400, 2600],
  );

  let previousRating = 1500;
  for (const { elo, modelElo, drawFactor } of MAIA_CLASSICAL_CALIBRATION) {
    assert.ok(Number.isInteger(modelElo), `Band ${elo} model Elo must be an integer`);
    assert.ok(modelElo >= 1500 && modelElo <= 3000, `Band ${elo} model Elo is out of range`);
    assert.ok(modelElo >= previousRating, `Band ${elo} model Elo decreased`);
    assert.ok(Number.isFinite(drawFactor) && drawFactor >= 1, `Band ${elo} draw factor is invalid`);
    previousRating = modelElo;
  }
});
