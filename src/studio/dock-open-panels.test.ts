// SIG-1347: the retired Opponent prep panel is no longer offered in the
// View > Open panel menu, but its id stays registered for saved layouts.
import assert from "node:assert/strict";
import test from "node:test";
import { OPEN_PANEL_ITEMS } from "./dock-api.ts";

test("the Open panel menu no longer offers Opponent prep", () => {
  assert.equal(OPEN_PANEL_ITEMS.some((item) => item.id === "opponentPrep"), false);
  assert.equal(OPEN_PANEL_ITEMS.some((item) => item.label === "Opponent prep"), false);
});

test("the other Studio panels stay in the Open panel menu", () => {
  const ids = OPEN_PANEL_ITEMS.map((item) => item.id);
  for (const id of ["notation", "repertoire", "engine", "myStats", "positionSearch"]) {
    assert.ok(ids.includes(id as (typeof ids)[number]), id);
  }
});
