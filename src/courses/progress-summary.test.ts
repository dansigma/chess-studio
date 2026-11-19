import assert from "node:assert/strict";
import test from "node:test";
import { chapterSummary, courseProgressSummary, reviewForecast } from "./progress-summary.ts";
import type { Course, CourseChapter, VariationProgress } from "./types.ts";

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

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const offsetIso = (ms: number) => new Date(NOW.getTime() + ms).toISOString();

const forecastCourse: Pick<Course, "chapters"> = {
  chapters: [
    chapter,
    {
      id: "ch2",
      title: "Two",
      variations: [
        { id: "d", title: "D", pgn: "" },
        { id: "e", title: "E", pgn: "" },
        { id: "f", title: "F", pgn: "" },
      ],
    },
  ],
};

test("reviewForecast: excludes unlearned, invalid, already-due, and >7d lines", () => {
  assert.deepEqual(
    reviewForecast(
      forecastCourse,
      {
        a: { step: 2, learned: false, reviewDueAt: offsetIso(HOUR_MS) },
        b: { step: 4, learned: true, reviewDueAt: "not-a-date" },
        c: learned(NOW.toISOString()),
        d: learned(PAST),
        e: learned(offsetIso(7 * DAY_MS + 1)),
      },
      NOW,
    ),
    { in4h: 0, in1d: 0, in7d: 0 },
  );
});

test("reviewForecast: disjoint boundaries at 4h, 24h, and 7d", () => {
  assert.deepEqual(reviewForecast(forecastCourse, { a: learned(offsetIso(1)) }, NOW), {
    in4h: 1,
    in1d: 0,
    in7d: 0,
  });
  assert.deepEqual(reviewForecast(forecastCourse, { a: learned(offsetIso(4 * HOUR_MS)) }, NOW), {
    in4h: 1,
    in1d: 0,
    in7d: 0,
  });
  assert.deepEqual(reviewForecast(forecastCourse, { a: learned(offsetIso(4 * HOUR_MS + 1)) }, NOW), {
    in4h: 0,
    in1d: 1,
    in7d: 0,
  });
  assert.deepEqual(reviewForecast(forecastCourse, { a: learned(offsetIso(DAY_MS)) }, NOW), {
    in4h: 0,
    in1d: 1,
    in7d: 0,
  });
  assert.deepEqual(reviewForecast(forecastCourse, { a: learned(offsetIso(DAY_MS + 1)) }, NOW), {
    in4h: 0,
    in1d: 0,
    in7d: 1,
  });
  assert.deepEqual(reviewForecast(forecastCourse, { a: learned(offsetIso(7 * DAY_MS)) }, NOW), {
    in4h: 0,
    in1d: 0,
    in7d: 1,
  });
  assert.deepEqual(reviewForecast(forecastCourse, { a: learned(offsetIso(7 * DAY_MS + 1)) }, NOW), {
    in4h: 0,
    in1d: 0,
    in7d: 0,
  });
});

test("reviewForecast and courseProgressSummary: counts multiple buckets together", () => {
  const progress: Record<string, VariationProgress> = {
    a: learned(PAST),
    b: learned(offsetIso(2 * HOUR_MS)),
    c: learned(offsetIso(12 * HOUR_MS)),
    d: learned(offsetIso(24 * HOUR_MS)),
    e: learned(offsetIso(3 * DAY_MS)),
    f: learned(offsetIso(10 * DAY_MS)),
  };
  assert.deepEqual(reviewForecast(forecastCourse, progress, NOW), { in4h: 1, in1d: 2, in7d: 1 });
  const summary = courseProgressSummary(forecastCourse as Course, progress, NOW);
  assert.deepEqual([summary.due, summary.in4h, summary.in1d, summary.in7d], [1, 1, 2, 1]);
});
