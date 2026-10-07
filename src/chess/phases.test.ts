import assert from "node:assert/strict";
import test from "node:test";
import { START_FEN } from "./tree.ts";
import { dividePhases, phaseAt } from "./phases.ts";

const developed =
  "r1bq1rk1/pppp1ppp/2n2n2/2b1p3/2B1P3/2N2N2/PPPP1PPP/3Q1RK1 w - - 6 8";
const endgame = "8/5k2/8/8/8/5K2/8/8 w - - 0 40";

test("the starting position is still the opening", () => {
  const division = dividePhases([START_FEN]);
  assert.equal(phaseAt(division, 0), "opening");
  assert.equal(division.middle, null);
});

test("developed pieces begin the middlegame", () => {
  const division = dividePhases([START_FEN, developed]);
  assert.equal(phaseAt(division, 1), "middlegame");
});

test("six or fewer pieces begin the endgame", () => {
  const division = dividePhases([START_FEN, developed, endgame]);
  assert.equal(phaseAt(division, 2), "endgame");
  assert.equal(phaseAt(division, 1), "middlegame");
});
