// SIG-1375: dueQueue orders a review session and honours the chapter filter.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  REVIEW_SEGMENT,
  dueQueue,
  playableDueQueue,
  reviewDueLabel,
  reviewHref,
} from "./review-queue.ts";
import type { Course, VariationProgress } from "./types.ts";

const NOW = new Date("2026-01-10T12:00:00Z");
const DAY = 86_400_000;

const course = {
  chapters: [
    {
      id: "ch1",
      title: "Chapter one",
      variations: [
        { id: "a", title: "A", pgn: "" },
        { id: "b", title: "B", pgn: "" },
      ],
    },
    { id: "empty", title: "Empty", variations: [] },
    {
      id: "ch2",
      title: "Chapter two",
      variations: [
        { id: "c", title: "C", pgn: "" },
        { id: "d", title: "D", pgn: "" },
      ],
    },
  ],
} as unknown as Course;

function learned(overrides: Partial<VariationProgress> = {}): VariationProgress {
  return { step: 8, learned: true, reviewLevel: 2, reviewDueAt: "2026-01-01T00:00:00Z", ...overrides };
}

describe("dueQueue", () => {
  it("lists only due lines, most overdue first", () => {
    const progress = {
      a: learned({ reviewDueAt: "2026-01-05T00:00:00Z" }),
      b: learned({ reviewDueAt: "2026-02-01T00:00:00Z" }),
      c: learned({ reviewDueAt: "2026-01-08T00:00:00Z" }),
      d: learned({ reviewDueAt: "2026-01-02T00:00:00Z" }),
    };
    assert.deepEqual(
      dueQueue(course, progress, NOW).map((line) => line.variation.id),
      ["d", "a", "c"],
    );
  });

  it("keeps course order when two lines are equally overdue", () => {
    const due = "2026-01-05T00:00:00Z";
    const progress = { c: learned({ reviewDueAt: due }), a: learned({ reviewDueAt: due }) };
    assert.deepEqual(
      dueQueue(course, progress, NOW).map((line) => line.variation.id),
      ["a", "c"],
    );
  });

  it("skips new lines and learned lines that are not due yet", () => {
    const progress = {
      a: { step: 2, learned: false },
      b: learned({ reviewDueAt: "2026-02-01T00:00:00Z" }),
      c: learned({ reviewDueAt: null }),
    };
    assert.deepEqual(dueQueue(course, progress, NOW), []);
  });

  it("limits the queue to one chapter", () => {
    const progress = {
      a: learned({ reviewDueAt: "2026-01-05T00:00:00Z" }),
      c: learned({ reviewDueAt: "2026-01-02T00:00:00Z" }),
      d: learned({ reviewDueAt: "2026-01-03T00:00:00Z" }),
    };
    const queue = dueQueue(course, progress, NOW, "ch2");
    assert.deepEqual(queue.map((line) => line.variation.id), ["c", "d"]);
    assert.ok(queue.every((line) => line.chapterId === "ch2" && line.chapterTitle === "Chapter two"));
  });

  it("keeps the line title and chapter for the summary", () => {
    const queue = dueQueue(course, { a: learned() }, NOW);
    assert.equal(queue[0].variation.title, "A");
    assert.equal(queue[0].chapterTitle, "Chapter one");
    assert.equal(queue[0].dueAt, "2026-01-01T00:00:00Z");
  });
});

describe("playableDueQueue", () => {
  const playable = {
    chapters: [
      {
        id: "ch1",
        title: "Chapter one",
        variations: [
          { id: "a", title: "A", pgn: "1. e4 e5 *" },
          { id: "b", title: "B", pgn: "   " },
        ],
      },
      {
        id: "ch2",
        title: "Chapter two",
        variations: [{ id: "c", title: "C", pgn: "1. d4 d5 *" }],
      },
    ],
  } as unknown as Course;

  it("keeps only due lines with a PGN to play", () => {
    const progress = { a: learned(), b: learned(), c: learned() };
    assert.deepEqual(
      playableDueQueue(playable, progress, NOW).map((line) => line.variation.id),
      ["a", "c"],
    );
  });

  it("keeps the chapter scope", () => {
    const progress = { a: learned(), c: learned() };
    assert.deepEqual(
      playableDueQueue(playable, progress, NOW, "ch2").map(
        (line) => line.variation.id,
      ),
      ["c"],
    );
  });
});

describe("reviewHref", () => {
  it("points at the session, with the chapter when given", () => {
    assert.equal(REVIEW_SEGMENT, "revisar");
    assert.equal(reviewHref("caro"), "/courses/caro/revisar");
    assert.equal(reviewHref("caro", 1), "/courses/caro/revisar?capitulo=2");
  });
});

describe("reviewDueLabel", () => {
  it("reads the next due time in days", () => {
    const due = new Date(NOW.getTime() + 3 * DAY).toISOString();
    assert.equal(reviewDueLabel("pt-br", due, NOW), "em 3 dias");
    assert.equal(reviewDueLabel("en", due, NOW), "in 3 days");
    assert.equal(
      reviewDueLabel("pt-br", new Date(NOW.getTime() + DAY).toISOString(), NOW),
      "em 1 dia",
    );
  });

  it("uses hours under a day", () => {
    const due = new Date(NOW.getTime() + 4 * 3_600_000).toISOString();
    assert.equal(reviewDueLabel("pt-br", due, NOW), "em 4 horas");
    assert.equal(reviewDueLabel("en", due, NOW), "in 4 hours");
  });

  it("falls back to agora for a past or missing date", () => {
    assert.equal(reviewDueLabel("pt-br", "2026-01-01T00:00:00Z", NOW), "agora");
    assert.equal(reviewDueLabel("pt-br", null, NOW), "agora");
    assert.equal(reviewDueLabel("en", null, NOW), "now");
  });
});
