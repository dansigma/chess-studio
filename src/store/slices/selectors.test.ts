import assert from "node:assert/strict";
import test from "node:test";
import { emptyBoard } from "./board-helpers.ts";
import { isSyncPending, selectDirtyCount } from "./selectors.ts";

// SIG-1228: the "waiting to sync" counter must use the same predicate as
// runDirtySavePass (dirty && !preview).
const board = (id: string, dirty: boolean, preview: boolean) => ({
  ...emptyBoard(),
  id,
  dirty,
  preview,
});

test("selectDirtyCount ignores dirty preview boards", () => {
  assert.equal(selectDirtyCount({ boards: [board("a", true, true)] }), 0);
});

test("selectDirtyCount counts dirty normal and pinned boards", () => {
  const boards = [board("a", true, false), board("b", true, false), board("c", false, false)];
  assert.equal(selectDirtyCount({ boards }), 2);
});

test("selectDirtyCount handles a mix of preview, pinned and normal boards", () => {
  const boards = [
    board("preview", true, true),
    board("clean-preview", false, true),
    board("pinned", true, false),
    board("normal", true, false),
    board("saved", false, false),
  ];
  assert.equal(selectDirtyCount({ boards }), 2);
  assert.deepEqual(boards.map(isSyncPending), [false, false, true, true, false]);
});
