import assert from "node:assert/strict";
import test from "node:test";
import { emptyReviewQueueState, isReviewNoteValid, reviewQueueState } from "./review-queue.ts";

test("approve marks a row pending then decided", () => {
  const started = reviewQueueState(emptyReviewQueueState(), { type: "approve-start", id: "a" });
  assert.ok(started.pending.has("a"));
  const done = reviewQueueState(started, { type: "approve-done", id: "a" });
  assert.ok(!done.pending.has("a"));
  assert.ok(done.decided.has("a"));
});

test("approve-start is a no-op for decided or pending rows", () => {
  const decided = reviewQueueState(emptyReviewQueueState(), { type: "approve-done", id: "a" });
  assert.equal(reviewQueueState(decided, { type: "approve-start", id: "a" }), decided);
  const pending = reviewQueueState(emptyReviewQueueState(), { type: "approve-start", id: "b" });
  assert.equal(reviewQueueState(pending, { type: "approve-start", id: "b" }), pending);
});

test("reject dialog opens, edits the note, and closes or decides", () => {
  const opened = reviewQueueState(emptyReviewQueueState(), { type: "reject-open", id: "a" });
  assert.deepEqual(opened.rejecting, { id: "a", note: "" });
  const edited = reviewQueueState(opened, { type: "reject-note", note: "needs work" });
  assert.deepEqual(edited.rejecting, { id: "a", note: "needs work" });
  assert.deepEqual(reviewQueueState(edited, { type: "reject-close" }).rejecting, null);
  const done = reviewQueueState(edited, { type: "reject-done", id: "a" });
  assert.equal(done.rejecting, null);
  assert.ok(done.decided.has("a"));
});

test("reject-done for another row leaves the dialog alone", () => {
  const opened = reviewQueueState(emptyReviewQueueState(), { type: "reject-open", id: "a" });
  assert.equal(reviewQueueState(opened, { type: "reject-done", id: "b" }), opened);
});

test("reject-open is a no-op for decided rows", () => {
  const decided = reviewQueueState(emptyReviewQueueState(), { type: "approve-done", id: "a" });
  assert.equal(reviewQueueState(decided, { type: "reject-open", id: "a" }), decided);
});

test("review notes shorter than 3 or longer than 500 chars are rejected", () => {
  assert.equal(isReviewNoteValid("  "), false);
  assert.equal(isReviewNoteValid("ab"), false);
  assert.equal(isReviewNoteValid("abc"), true);
  assert.equal(isReviewNoteValid("a".repeat(500)), true);
  assert.equal(isReviewNoteValid(` ${"a".repeat(500)} `), true);
  assert.equal(isReviewNoteValid("a".repeat(501)), false);
});
