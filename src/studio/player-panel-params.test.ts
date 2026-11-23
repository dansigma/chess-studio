import assert from "node:assert/strict";
import test from "node:test";
import { parsePlayerPanelParams } from "./player-panel-params";

test("panel params accept a Base Xadrez Digital player", () => {
  const player = {
    id: "xadrez-digital:3-7", source: "xadrez-digital", username: "3-7",
    displayName: "Lima, Lucas", subtitle: "Base Xadrez Digital · 1.234 partidas · 2003–2025",
  };
  assert.deepEqual(parsePlayerPanelParams({ player, color: "black" }), { player, color: "black", result: "all" });
  assert.equal(parsePlayerPanelParams({ player: { ...player, source: "other" } }).player, null);
});
