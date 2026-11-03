import assert from "node:assert/strict";
import test from "node:test";
import {
  NOTATION_DENSITIES,
  NOTATION_DENSITY_IDS,
  isNotationDensity,
} from "./notation-density.ts";

test("notation density exposes normal, compact and table ids", () => {
  assert.deepEqual([...NOTATION_DENSITY_IDS], ["normal", "compact", "table"]);
  assert.equal(NOTATION_DENSITIES.normal.label, "Normal");
  assert.equal(NOTATION_DENSITIES.compact.label, "Compact");
  assert.equal(NOTATION_DENSITIES.table.label, "Table");
});

test("isNotationDensity accepts only normal, compact and table", () => {
  assert.equal(isNotationDensity("normal"), true);
  assert.equal(isNotationDensity("compact"), true);
  assert.equal(isNotationDensity("table"), true);
  assert.equal(isNotationDensity("roomy"), false);
  assert.equal(isNotationDensity(""), false);
  assert.equal(isNotationDensity(null), false);
  assert.equal(isNotationDensity(undefined), false);
  assert.equal(isNotationDensity(42), false);
});
