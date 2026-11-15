import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyCourse } from "./admin-draft.ts";
import { isDraftDirty } from "./dirty.ts";

test("isDraftDirty is clean for the same object or an equal copy", () => {
  const draft = emptyCourse();
  assert.equal(isDraftDirty(draft, draft), false);
  assert.equal(isDraftDirty({ ...draft, chapters: [] }, draft), false);
});

test("isDraftDirty treats an undefined entry as absent", () => {
  const draft = emptyCourse();
  assert.equal(isDraftDirty({ ...draft, authorName: undefined }, draft), false);
});

test("isDraftDirty is dirty after editing a field", () => {
  const draft = emptyCourse();
  assert.equal(isDraftDirty({ ...draft, title: "x" }, draft), true);
});

test("isDraftDirty sees a nested line edit and is clean again when reverted", () => {
  const draft = {
    ...emptyCourse(),
    chapters: [{ id: "c1", title: "A", variations: [{ id: "v1", title: "L", pgn: "1. e4" }] }],
  };
  const edited = {
    ...draft,
    chapters: [{ id: "c1", title: "A", variations: [{ id: "v1", title: "L", pgn: "1. e4 e5" }] }],
  };
  assert.equal(isDraftDirty(edited, draft), true);
  assert.equal(isDraftDirty(structuredClone(draft), draft), false);
});

test("isDraftDirty sees a chapter added or reordered", () => {
  const a = { id: "a", title: "A", variations: [] };
  const b = { id: "b", title: "B", variations: [] };
  const draft = { ...emptyCourse(), chapters: [a, b] };
  assert.equal(isDraftDirty({ ...draft, chapters: [b, a] }, draft), true);
  assert.equal(isDraftDirty({ ...draft, chapters: [a] }, draft), true);
});
