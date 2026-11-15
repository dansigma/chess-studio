import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";
import { setupDom, teardownDom } from "../../test-utils/dom.ts";
import { cleanup, render } from "@testing-library/react";
import type { Course, CourseChapter } from "../types.ts";

before(() => setupDom());
after(() => teardownDom());
afterEach(() => cleanup());

const { CourseSyllabus, syllabusSummary } = await import("./CourseSyllabus.tsx");

const chapters: CourseChapter[] = [
  {
    id: "ch1",
    title: "One",
    description: "About one",
    hasVideo: true,
    variations: [
      { id: "a", title: "A", pgn: "" },
      { id: "b", title: "B", pgn: "" },
    ],
  },
  { id: "ch2", title: "Empty", variations: [] },
  { id: "ch3", title: "Two", variations: [{ id: "c", title: "C", pgn: "" }] },
];

function makeCourse(list: CourseChapter[] = chapters): Course {
  return { id: "c1", slug: "caro", title: "Caro", chapters: list } as Course;
}

function view(course: Course, locale: "en" | "pt-br" = "pt-br") {
  return render(
    <CourseSyllabus course={course} locale={locale} progress={{}} frameCounts={{}} onOpenInStudio={() => {}} />,
  ).container;
}

test("syllabusSummary counts chapters with lines, lines and video chapters", () => {
  assert.deepEqual(syllabusSummary(chapters), { chapters: 2, lines: 3, videos: 1 });
  const withUrl: CourseChapter[] = [
    { id: "x", title: "X", videoUrl: "https://y", variations: [{ id: "q", title: "Q", pgn: "" }] },
  ];
  assert.deepEqual(syllabusSummary(withUrl), { chapters: 1, lines: 1, videos: 1 });
});

test("renders heading, summary and collapsible chapters in pt-br", () => {
  const c = view(makeCourse());
  const text = c.textContent ?? "";
  assert.match(text, /Conteúdo do curso/);
  assert.match(text, /2 capítulos · 3 linhas · 1 aula em vídeo/);
  assert.match(text, /Capítulo 1/);
  assert.match(text, /Capítulo 2/);
  assert.ok(!text.includes("Empty"));
  const details = c.querySelectorAll("details");
  assert.equal(details.length, 2);
  assert.equal(details[0].hasAttribute("open"), true);
  assert.equal(details[1].hasAttribute("open"), false);
  assert.match(details[0].querySelector("summary")?.textContent ?? "", /2 linhas/);
  assert.match(details[1].querySelector("summary")?.textContent ?? "", /1 linha/);
});

test("video icon only on chapters with a video; summary omits videos at 0", () => {
  const c = view(makeCourse());
  const icons = c.querySelectorAll("[data-testid='chapter-video-icon']");
  assert.equal(icons.length, 1);
  assert.ok(c.querySelectorAll("details")[0].contains(icons[0]));
  const none = view(makeCourse([{ id: "z", title: "Z", variations: [{ id: "q", title: "Q", pgn: "" }] }]), "en");
  assert.ok(!(none.textContent ?? "").includes("video"));
  assert.match(none.textContent ?? "", /1 chapter · 1 line/);
});

test("shows the description when set and links lines to their lesson", () => {
  const c = view(makeCourse());
  assert.match(c.textContent ?? "", /About one/);
  const hrefs = [...c.querySelectorAll("a")].map((a) => a.getAttribute("href"));
  assert.deepEqual(hrefs, ["/courses/caro/a", "/courses/caro/b", "/courses/caro/c"]);
});

test("renders nothing when no chapter has lines", () => {
  const c = view(makeCourse([{ id: "e", title: "E", variations: [] }]));
  assert.equal(c.querySelector("section"), null);
});
