import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";
import { setupDom, teardownDom } from "../../test-utils/dom.ts";
import { cleanup, render } from "@testing-library/react";
import type { Course, VariationProgress } from "../types.ts";
import { nextLineId } from "../next-line.ts";

before(() => setupDom());
after(() => teardownDom());
afterEach(() => cleanup());

const { CourseInfoCard } = await import("./CourseInfoCard.tsx");

function makeCourse(patch: Partial<Course> = {}): Course {
  return {
    id: "c1",
    slug: "caro",
    title: "Caro",
    summary: "",
    theme: "openings",
    color: "black",
    status: "published",
    accessTier: "free",
    priceCents: null,
    level: "intermediate",
    eloMin: 1200,
    eloMax: 1600,
    language: "pt-br",
    durationMinutes: 200,
    chapters: [
      { id: "ch1", title: "One", variations: [{ id: "a", title: "A", pgn: "" }, { id: "b", title: "B", pgn: "" }] },
      { id: "ch2", title: "Empty", variations: [] },
      { id: "ch3", title: "Two", variations: [{ id: "c", title: "C", pgn: "" }] },
    ],
    ...patch,
  } as Course;
}

function view(course: Course, progress: Record<string, VariationProgress> = {}, ready = true) {
  return render(<CourseInfoCard course={course} progress={progress} ready={ready} locale="pt-br" />).container;
}

test("nextLineId returns the first unlearned line, else null", () => {
  assert.equal(nextLineId(["a", "b"], {}), "a");
  assert.equal(nextLineId(["a", "b"], { a: { step: 3, learned: true } }), "b");
  assert.equal(nextLineId(["a"], { a: { step: 3, learned: true } }), null);
  assert.equal(nextLineId([], {}), null);
});

test("info card shows level scale, Elo, counts, duration, language, color and theme", () => {
  const text = view(makeCourse()).textContent ?? "";
  for (const expected of ["Iniciante", "Intermediário", "Avançado", "Elo 1.200–1.600", "3 linhas", "2 capítulos", "≈ 3 h 20 min", "Português (Brasil)", "Pretas", "Aberturas"]) {
    assert.ok(text.includes(expected), `missing ${expected} in ${text}`);
  }
  assert.ok(!/R\$|premium|comprar/i.test(text));
});

test("info card omits Elo and duration when absent; short durations show minutes only", () => {
  const text = view(makeCourse({ eloMin: null, eloMax: null, durationMinutes: null })).textContent ?? "";
  assert.ok(!text.includes("Elo "));
  assert.ok(!text.includes("Duração"));
  cleanup();
  assert.ok((view(makeCourse({ durationMinutes: 45 })).textContent ?? "").includes("≈ 45 min"));
});

test("main button: Começar curso on the first line without progress", () => {
  const link = view(makeCourse()).querySelector("a");
  assert.equal(link?.textContent, "Começar curso");
  assert.equal(link?.getAttribute("href"), "/courses/caro/a");
});

test("main button stays Começar curso until progress has loaded", () => {
  const link = view(makeCourse(), { a: { step: 2, learned: false } }, false).querySelector("a");
  assert.equal(link?.textContent, "Começar curso");
  assert.equal(link?.getAttribute("href"), "/courses/caro/a");
});

test("main button: Continuar estudando opens the next unlearned line", () => {
  const link = view(makeCourse(), { a: { step: 5, learned: true } }).querySelector("a");
  assert.equal(link?.textContent, "Continuar estudando");
  assert.equal(link?.getAttribute("href"), "/courses/caro/b");
});

test("main button: partial progress on the first line continues it", () => {
  const link = view(makeCourse(), { a: { step: 1, learned: false } }).querySelector("a");
  assert.equal(link?.textContent, "Continuar estudando");
  assert.equal(link?.getAttribute("href"), "/courses/caro/a");
});

test("main button: all learned still says Continuar estudando and opens the first line", () => {
  const all = { a: { step: 5, learned: true }, b: { step: 5, learned: true }, c: { step: 5, learned: true } };
  const link = view(makeCourse(), all).querySelector("a");
  assert.equal(link?.textContent, "Continuar estudando");
  assert.equal(link?.getAttribute("href"), "/courses/caro/a");
});
