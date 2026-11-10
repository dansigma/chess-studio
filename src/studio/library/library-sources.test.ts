import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { reconcileLibrarySources } from "./library-sources";

describe("reconcileLibrarySources", () => {
  it("selects every available source on the first run", () => {
    assert.deepEqual(reconcileLibrarySources(["my-games"], ["my-games", "file:a"], true), ["my-games", "file:a"]);
  });

  it("keeps the user's choice and drops removed databases", () => {
    assert.deepEqual(reconcileLibrarySources(["file:a", "file:b"], ["my-games", "file:a"], false), ["file:a"]);
  });

  it("does not add new databases to a chosen selection", () => {
    assert.deepEqual(reconcileLibrarySources(["my-games"], ["my-games", "file:c"], false), ["my-games"]);
  });

  it("falls back to every source when nothing chosen is left", () => {
    assert.deepEqual(reconcileLibrarySources(["file:gone"], ["my-games", "file:a"], false), ["my-games", "file:a"]);
  });
});
