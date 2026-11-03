import assert from "node:assert/strict";
import test from "node:test";
import { groupMinimumHeight } from "./dock-constraints.ts";

test("groupMinimumHeight floors groups by their most demanding panel (SIG-1197)", () => {
  assert.equal(groupMinimumHeight(["board:abc"]), null);
  // Engine needs 60 + the 32px tab strip, under dockview's 100px floor.
  assert.equal(groupMinimumHeight(["engine", "evalGraph"]), 100);
  assert.equal(groupMinimumHeight(["notation", "repertoire"]), 152);
  assert.equal(groupMinimumHeight(["explorer:u1", "games"]), 172);
  assert.equal(groupMinimumHeight(["notation", "explorer"]), 172);
});
