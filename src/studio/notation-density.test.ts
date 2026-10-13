import assert from "node:assert/strict";
import test from "node:test";
import {
  NOTATION_DENSITIES,
  NOTATION_DENSITY_IDS,
  isNotationDensity,
} from "./notation-density.ts";

test("notation density exposes normal and compact ids", () => {
  assert.deepEqual([...NOTATION_DENSITY_IDS], ["normal", "compact"]);
  assert.equal(NOTATION_DENSITIES.normal.label, "Normal");
  assert.equal(NOTATION_DENSITIES.compact.label, "Compact");
});

test("isNotationDensity accepts only normal and compact", () => {
  assert.equal(isNotationDensity("normal"), true);
  assert.equal(isNotationDensity("compact"), true);
  assert.equal(isNotationDensity("roomy"), false);
  assert.equal(isNotationDensity(""), false);
  assert.equal(isNotationDensity(null), false);
  assert.equal(isNotationDensity(undefined), false);
  assert.equal(isNotationDensity(42), false);
});
