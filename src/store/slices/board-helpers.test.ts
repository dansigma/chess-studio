import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { withActive, emptyBoard } from "./board-helpers.ts";

describe("withActive", () => {
  it("updates only the board matching activeBoardId", () => {
    const a = emptyBoard("A", "board-a");
    const b = emptyBoard("B", "board-b");
    const next = withActive([a, b], "board-b", (board) => ({
      ...board,
      title: "updated",
    }));
    assert.equal(next[0].title, "A");
    assert.equal(next[1].title, "updated");
  });

  it("falls back to boards[0] when activeBoardId matches no board (stale id)", () => {
    // Regression: reads fall back via selectActiveBoard(), but writes used to
    // match nothing — every move/navigation became a silent no-op while the
    // board kept rendering boards[0].
    const a = emptyBoard("A", "board-a");
    const b = emptyBoard("B", "board-b");
    const next = withActive([a, b], "ghost-id", (board) => ({
      ...board,
      title: "landed",
    }));
    assert.equal(next[0].title, "landed");
    assert.equal(next[1].title, "B");
  });
});
