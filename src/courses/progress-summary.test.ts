import assert from "node:assert/strict";
import test from "node:test";
import { chapterSummary } from "./progress-summary.ts";
import type { CourseChapter, VariationProgress } from "./types.ts";

const NOW = new Date("2026-01-10T12:00:00Z");
const PAST = "2026-01-09T00:00:00Z";
const FUTURE = "2026-01-20T00:00:00Z";

const chapter: CourseChapter = {
  id: "ch1",
  title: "One",
  variations: [
    { id: "a", title: "A", pgn: "" },
    { id: "b", title: "B", pgn: "" },
    { id: "c", title: "C", pgn: "" },
  ],
};

const learned = (due: string): VariationProgress => ({ step: 4, learned: true, reviewLevel: 1, reviewDueAt: due });

test("chapterSummary: untouched chapter is new", () => {
  assert.deepEqual(chapterSummary(chapter, {}, NOW), { learned: 0, total: 3, due: 0, status: "new" });
});

test("chapterSummary: an opened line, without a learned one, is in progress", () => {
  assert.deepEqual(chapterSummary(chapter, { a: { step: 2, learned: false } }, NOW), {
    learned: 0,
    total: 3,
    due: 0,
    status: "inProgress",
  });
});

test("chapterSummary: some lines learned and none due is in progress", () => {
  assert.deepEqual(chapterSummary(chapter, { a: learned(FUTURE) }, NOW), {
    learned: 1,
    total: 3,
    due: 0,
    status: "inProgress",
  });
});

test("chapterSummary: every line learned with no reviews due is done", () => {
  assert.deepEqual(
    chapterSummary(chapter, { a: learned(FUTURE), b: learned(FUTURE), c: learned(FUTURE) }, NOW),
    { learned: 3, total: 3, due: 0, status: "done" },
  );
});

test("chapterSummary: due reviews win over done and in progress", () => {
  const all = chapterSummary(chapter, { a: learned(FUTURE), b: learned(PAST), c: learned(FUTURE) }, NOW);
  assert.deepEqual(all, { learned: 3, total: 3, due: 1, status: "review" });
  const partial = chapterSummary(chapter, { a: learned(PAST), b: learned(PAST) }, NOW);
  assert.deepEqual(partial, { learned: 2, total: 3, due: 2, status: "review" });
});

test("chapterSummary: an empty chapter counts as new, never done", () => {
  const empty: CourseChapter = { id: "empty", title: "Empty", variations: [] };
  assert.deepEqual(chapterSummary(empty, {}, NOW), { learned: 0, total: 0, due: 0, status: "new" });
});
