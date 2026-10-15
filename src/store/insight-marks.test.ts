import assert from "node:assert/strict";
import test from "node:test";
import { START_FEN } from "../chess/tree.ts";
import { selectActiveBoard, useStudioStore } from "./studio-store.ts";

// SIG-959: Insights hover/threat marks live on a transient channel, outside
// BoardSession.tree, so they must not dirty the game or reach the PGN.
test("setInsightMarks leaves boards, tree and dirty flag untouched", () => {
  const store = useStudioStore;
  const before = selectActiveBoard(store.getState());
  const boardsBefore = store.getState().boards;
  const marks = {
    squares: [{ square: "e4", color: "R" as const }],
    arrows: [{ from: "e2", to: "e4", color: "R" as const }],
  };

  store.getState().setInsightMarks({ fen: START_FEN, marks });
  assert.deepEqual(store.getState().insightMarks, { fen: START_FEN, marks });
  assert.equal(store.getState().boards, boardsBefore);
  const during = selectActiveBoard(store.getState());
  assert.equal(during.dirty, before.dirty);
  assert.equal(during.tree, before.tree);

  store.getState().setInsightMarks(null);
  assert.equal(store.getState().insightMarks, null);
  assert.equal(selectActiveBoard(store.getState()).dirty, before.dirty);
});
