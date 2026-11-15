import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";
import { setupDom, teardownDom } from "../../test-utils/dom.ts";
import { cleanup, render } from "@testing-library/react";
import type { Course, CourseChapter, VariationProgress } from "../types.ts";

before(() => setupDom());
after(() => teardownDom());
afterEach(() => cleanup());

const { ChapterGrid } = await import("./ChapterGrid.tsx");

const NOW = new Date("2026-01-10T12:00:00Z");
const PAST = "2026-01-09T00:00:00Z";
const FUTURE = "2026-01-20T00:00:00Z";

const chapters: CourseChapter[] = [
  {
    id: "ch1",
    title: "Abertura Italiana",
    hasVideo: true,
    variations: [
      { id: "a", title: "A", pgn: "" },
      { id: "b", title: "B", pgn: "" },
    ],
  },
  { id: "empty", title: "Sem linhas", variations: [] },
  { id: "ch2", title: "Defesa Siciliana", variations: [{ id: "c", title: "C", pgn: "" }] },
  { id: "ch3", title: "Final de peões", hasVideo: true, variations: [{ id: "d", title: "D", pgn: "" }] },
  {
    id: "ch4",
    title: "Táticas",
    variations: [
      { id: "e", title: "E", pgn: "" },
      { id: "f", title: "F", pgn: "" },
    ],
  },
];

const course = { id: "c1", slug: "caro", title: "Caro", chapters } as unknown as Course;

const learned = (due: string): VariationProgress => ({ step: 4, learned: true, reviewLevel: 1, reviewDueAt: due });

const progress: Record<string, VariationProgress> = {
  a: learned(FUTURE),
  b: { step: 1, learned: false },
  c: learned(PAST),
  e: learned(FUTURE),
  f: learned(FUTURE),
};

function view(locale: "en" | "pt-br" = "pt-br") {
  return render(
    <ChapterGrid course={course} chapters={chapters} progress={progress} locale={locale} now={NOW} />,
  ).container;
}

test("grid renders one card per chapter with lines, numbered in order", () => {
  const c = view();
  const links = [...c.querySelectorAll("li a[data-chapter-open]")];
  assert.deepEqual(
    links.map((link) => link.getAttribute("href")),
    ["/courses/caro?capitulo=1", "/courses/caro?capitulo=2", "/courses/caro?capitulo=3", "/courses/caro?capitulo=4"],
  );
  const text = c.textContent ?? "";
  assert.match(text, /Capítulos/);
  assert.match(text, /Capítulo 1/);
  assert.match(text, /Abertura Italiana/);
  assert.match(text, /Capítulo 4/);
  assert.ok(!text.includes("Sem linhas"));
});

test("a chapter with reviews due links its Revisar (N) to that chapter's session", () => {
  const c = view();
  const review = [...c.querySelectorAll("li a[data-chapter-review]")];
  assert.deepEqual(
    review.map((link) => [link.textContent, link.getAttribute("href")]),
    [["Revisar (1)", "/courses/caro/revisar?capitulo=2"]],
  );
});

test("chapter card shows the line count, learned/total bar and the chapter status", () => {
  const c = view();
  const [first, second, third, fourth] = [...c.querySelectorAll("li")];
  const firstText = first.textContent ?? "";
  assert.match(firstText, /2 linhas/);
  assert.match(firstText, /1\/2/);
  assert.match(firstText, /Em andamento/);
  assert.equal(first.querySelector("[role='progressbar']")?.getAttribute("aria-valuenow"), "1");
  assert.equal(first.querySelector("[role='progressbar']")?.getAttribute("aria-valuemax"), "2");

  assert.match(second.textContent ?? "", /1 linha/);
  assert.match(second.textContent ?? "", /Revisar \(1\)/);

  assert.match(third.textContent ?? "", /Não iniciado/);
  assert.match(third.textContent ?? "", /0\/1/);

  assert.match(fourth.textContent ?? "", /2\/2/);
  assert.match(fourth.textContent ?? "", /Concluído/);
});

test("video icon only on chapters with a video lesson", () => {
  const c = view();
  const icons = [...c.querySelectorAll("[data-testid='chapter-video-icon']")];
  assert.equal(icons.length, 2);
  const links = [...c.querySelectorAll("li a[data-chapter-open]")];
  assert.ok(links[0].contains(icons[0]));
  assert.ok(links[2].contains(icons[1]));
});

test("grid labels render in English too", () => {
  const text = view("en").textContent ?? "";
  assert.match(text, /Chapters/);
  assert.match(text, /Chapter 1/);
  assert.match(text, /2 lines/);
  assert.match(text, /In progress/);
  assert.match(text, /Review \(1\)/);
  assert.match(text, /Completed/);
  assert.match(text, /Not started/);
});
