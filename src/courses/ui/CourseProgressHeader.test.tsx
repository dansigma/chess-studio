import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";
import { setupDom, teardownDom } from "../../test-utils/dom.ts";
import { cleanup, render } from "@testing-library/react";
import type { Course, VariationProgress } from "../types.ts";
import { courseProgressSummary } from "../progress-summary.ts";

before(() => setupDom());
after(() => teardownDom());
afterEach(() => cleanup());

const { CourseProgressHeader } = await import("./CourseProgressHeader.tsx");

const NOW = new Date("2026-01-10T12:00:00Z");
const PAST = "2026-01-09T00:00:00Z";
const FUTURE = "2026-01-20T00:00:00Z";

const course = {
  id: "c1",
  slug: "caro",
  title: "Caro",
  color: "black",
  chapters: [
    { id: "ch1", title: "One", variations: [{ id: "a", title: "A", pgn: "" }, { id: "b", title: "B", pgn: "" }] },
    { id: "ch2", title: "Empty", variations: [] },
    { id: "ch3", title: "Two", variations: [{ id: "c", title: "C", pgn: "" }, { id: "d", title: "D", pgn: "" }] },
  ],
} as unknown as Course;

const learned = (due: string): VariationProgress => ({ step: 3, learned: true, reviewLevel: 1, reviewDueAt: due });

function view(progress: Record<string, VariationProgress>, ready = true) {
  return render(
    <CourseProgressHeader course={course} progress={progress} ready={ready} locale="pt-br" now={NOW} />,
  ).container;
}

test("summary: none, partial, some due, all learned", () => {
  const none = courseProgressSummary(course, {}, NOW);
  assert.deepEqual(
    [none.learned, none.total, none.due, none.nextLineId, none.complete, none.hasProgress],
    [0, 4, 0, "a", false, false],
  );

  const partial = courseProgressSummary(course, { a: learned(FUTURE), b: { step: 2, learned: false } }, NOW);
  assert.deepEqual(
    [partial.learned, partial.percent, partial.due, partial.nextLineId, partial.firstDueLineId, partial.complete, partial.hasProgress],
    [1, 25, 0, "b", null, false, true],
  );

  const due = courseProgressSummary(course, { a: learned(FUTURE), b: learned(PAST), c: learned(PAST) }, NOW);
  assert.deepEqual([due.due, due.firstDueLineId, due.nextLineId], [2, "b", "d"]);

  const all = courseProgressSummary(
    course,
    { a: learned(FUTURE), b: learned(FUTURE), c: learned(FUTURE), d: learned(FUTURE) },
    NOW,
  );
  assert.deepEqual([all.complete, all.percent, all.nextLineId, all.firstLineId], [true, 100, null, "a"]);
});

test("header is hidden without progress or before progress loads", () => {
  assert.equal(view({}).textContent, "");
  assert.equal(view({ a: learned(FUTURE) }, false).textContent, "");
});

test("partial progress with due lines: Continuar and Revisar (N)", () => {
  const c = view({ a: learned(PAST), b: learned(PAST) });
  const text = c.textContent ?? "";
  assert.ok(text.includes("2 de 4 linhas aprendidas"), text);
  assert.ok(text.includes("50%"));
  const links = [...c.querySelectorAll("a")];
  assert.deepEqual(
    links.map((l) => [l.textContent, l.getAttribute("href")]),
    [
      ["Continuar", "/courses/caro/c"],
      ["Revisar (2)", "/courses/caro/a"],
    ],
  );
  assert.ok(!text.includes("Nenhuma revisão pendente"));
});

test("no lines due: Revisar hidden and message shown", () => {
  const text = view({ a: learned(FUTURE) }).textContent ?? "";
  assert.ok(text.includes("Nenhuma revisão pendente"));
  assert.ok(!text.includes("Revisar ("));
});

test("complete course: Revisar curso and Curso concluído", () => {
  const c = view({ a: learned(FUTURE), b: learned(FUTURE), c: learned(FUTURE), d: learned(FUTURE) });
  assert.ok((c.textContent ?? "").includes("Curso concluído"));
  const link = c.querySelector("a");
  assert.equal(link?.textContent, "Revisar curso");
  assert.equal(link?.getAttribute("href"), "/courses/caro/a");
  assert.ok(!(c.textContent ?? "").includes("Continuar"));
});
