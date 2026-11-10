import assert from "node:assert/strict";
import { test } from "node:test";
import { parseWorkspaceView, withWorkspaceView } from "./workspace-view-url.ts";

test("parseWorkspaceView reads ?view=library and defaults to studio", () => {
  assert.equal(parseWorkspaceView("?view=library"), "library");
  assert.equal(parseWorkspaceView("?fen=x&view=library"), "library");
  assert.equal(parseWorkspaceView(""), "studio");
  assert.equal(parseWorkspaceView("?view=other"), "studio");
});

test("withWorkspaceView sets and clears the parameter, keeping others", () => {
  assert.equal(withWorkspaceView("", "library"), "?view=library");
  assert.equal(withWorkspaceView("?a=1", "library"), "?a=1&view=library");
  assert.equal(withWorkspaceView("?a=1&view=library", "studio"), "?a=1");
  assert.equal(withWorkspaceView("?view=library", "studio"), "");
});
