import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { nextFocusIndex } from "./use-dialog-focus";
import { nextMenuIndex } from "./use-menu-keyboard";

describe("nextFocusIndex", () => {
  it("wraps forward past the last item", () => {
    assert.equal(nextFocusIndex(2, 3, false), 0);
  });
  it("wraps backward before the first item", () => {
    assert.equal(nextFocusIndex(0, 3, true), 2);
  });
  it("steps normally inside the range", () => {
    assert.equal(nextFocusIndex(0, 3, false), 1);
    assert.equal(nextFocusIndex(1, 3, true), 0);
  });
  it("handles an empty list", () => {
    assert.equal(nextFocusIndex(0, 0, false), 0);
  });
});

describe("nextMenuIndex", () => {
  it("moves down and wraps", () => {
    assert.equal(nextMenuIndex(1, 3, "down"), 2);
    assert.equal(nextMenuIndex(2, 3, "down"), 0);
  });
  it("moves up and wraps", () => {
    assert.equal(nextMenuIndex(0, 3, "up"), 2);
    assert.equal(nextMenuIndex(1, 3, "up"), 0);
  });
  it("jumps to first and last", () => {
    assert.equal(nextMenuIndex(2, 5, "first"), 0);
    assert.equal(nextMenuIndex(0, 5, "last"), 4);
  });
  it("handles an empty list", () => {
    assert.equal(nextMenuIndex(0, 0, "down"), 0);
  });
});
