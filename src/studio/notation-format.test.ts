import assert from "node:assert/strict";
import test from "node:test";
import { displayDate, displayEvent, pathKey } from "./notation-format.ts";

test("pathKey joins plies with dots", () => {
  assert.equal(pathKey([]), "");
  assert.equal(pathKey([0]), "0");
  assert.equal(pathKey([0, 1, 2]), "0.1.2");
});

test("displayDate drops unknown components", () => {
  assert.equal(displayDate(undefined), null);
  assert.equal(displayDate(""), null);
  assert.equal(displayDate("?"), null);
  assert.equal(displayDate("????.??.??"), null);
  assert.equal(displayDate("2004.??.??"), "2004");
  assert.equal(displayDate("2004.06.??"), "2004.06");
  assert.equal(displayDate("2004.06.19"), "2004.06.19");
});

test("displayEvent hides placeholder and casual games", () => {
  assert.equal(displayEvent(undefined), null);
  assert.equal(displayEvent(""), null);
  assert.equal(displayEvent("?"), null);
  assert.equal(displayEvent("Casual game"), null);
  assert.equal(displayEvent("Wijk aan Zee"), "Wijk aan Zee");
});
