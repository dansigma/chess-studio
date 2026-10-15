import assert from "node:assert/strict";
import test from "node:test";
import { notationDraftSyncKey, selectDraftCommit, selectEditedComment } from "./notation-draft.ts";

test("selectEditedComment tracks the open editor", () => {
  assert.equal(selectEditedComment("comment", "after", "before"), "after");
  assert.equal(selectEditedComment("commentBefore", "after", "before"), "before");
  assert.equal(selectEditedComment("headers", "after", "before"), null);
  assert.equal(selectEditedComment(null, "after", "before"), null);
});

test("notationDraftSyncKey is null unless an editor is open", () => {
  assert.equal(notationDraftSyncKey(null, "b1", "", null), null);
  assert.equal(notationDraftSyncKey("headers", "b1", "", null), null);
  assert.equal(notationDraftSyncKey("comment", "b1", "0.1", "hello"), "comment|b1|0.1|hello");
  assert.equal(notationDraftSyncKey("commentBefore", "b1", "", ""), "commentBefore|b1||");
});

test("selectDraftCommit returns nothing when the draft did not change", () => {
  assert.equal(selectDraftCommit("comment", "same", "same", "before"), null);
  assert.equal(selectDraftCommit("commentBefore", "same", "after", "same"), null);
  assert.equal(selectDraftCommit("headers", "typed", "after", "before"), null);
  assert.equal(selectDraftCommit(null, "typed", "after", "before"), null);
});

test("selectDraftCommit targets the open editor", () => {
  assert.deepEqual(selectDraftCommit("comment", "new", "old", "before"), {
    target: "after",
    value: "new",
  });
  assert.deepEqual(selectDraftCommit("commentBefore", "new", "after", "old"), {
    target: "before",
    value: "new",
  });
});
