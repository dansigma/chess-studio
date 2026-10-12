import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { withActive, emptyBoard, nextActiveBoardId } from "./board-helpers.ts";

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

describe("nextActiveBoardId", () => {
  it("closing the active middle board focuses the previous board", () => {
    const boards = [
      emptyBoard("A", "board-a"),
      emptyBoard("B", "board-b"),
      emptyBoard("C", "board-c"),
    ];
    assert.equal(nextActiveBoardId(boards, "board-b"), "board-a");
  });

  it("closing the active first board focuses the next board", () => {
    const boards = [emptyBoard("A", "board-a"), emptyBoard("B", "board-b")];
    assert.equal(nextActiveBoardId(boards, "board-a"), "board-b");
  });

  it("closing a non-active board is decided by the caller (helper still reports neighbor)", () => {
    // closeBoard keeps the current active id for non-active closes; the
    // helper only answers "who would a browser tab focus next".
    const boards = [
      emptyBoard("A", "board-a"),
      emptyBoard("B", "board-b"),
      emptyBoard("C", "board-c"),
    ];
    assert.equal(nextActiveBoardId(boards, "board-c"), "board-b");
  });

  it("closing the only board returns null so the caller reseeds", () => {
    const boards = [emptyBoard("A", "board-a")];
    assert.equal(nextActiveBoardId(boards, "board-a"), null);
  });

  it("closing an unknown id returns null", () => {
    const boards = [emptyBoard("A", "board-a")];
    assert.equal(nextActiveBoardId(boards, "ghost-id"), null);
  });
});
