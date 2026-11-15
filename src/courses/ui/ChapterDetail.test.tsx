import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";
import { setupDom, teardownDom } from "../../test-utils/dom.ts";
import { cleanup, render } from "@testing-library/react";
import type { Course, CourseChapter } from "../types.ts";

before(() => setupDom());
after(() => teardownDom());
afterEach(() => cleanup());

const { ChapterDetail } = await import("./ChapterDetail.tsx");

const NOW = new Date("2026-01-10T12:00:00Z");

const chapter: CourseChapter = {
  id: "ch2",
  title: "Defesa Siciliana",
  videoUrl: "https://youtu.be/dQw4w9WgXcQ",
  description: "Plano do capítulo.",
  variations: [
    { id: "a", title: "Variante Najdorf", pgn: "" },
    { id: "b", title: "Variante Dragão", pgn: "" },
  ],
};

const course = { id: "c1", slug: "caro", title: "Caro", chapters: [chapter] } as unknown as Course;

function view({
  locale = "pt-br",
  value = chapter,
}: {
  locale?: "en" | "pt-br";
  value?: CourseChapter;
} = {}) {
  return render(
    <ChapterDetail course={course} chapter={value} number={2} progress={{}} locale={locale} now={NOW} />,
  ).container;
}

test("chapter view leads with the video, the description and the video → lines track", () => {
  const c = view();
  const text = c.textContent ?? "";
  assert.match(text, /Capítulo 2/);
  assert.match(text, /Defesa Siciliana/);
  assert.match(text, /Plano do capítulo\./);
  assert.equal(c.querySelector("iframe")?.getAttribute("src"), "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
  assert.ok(text.indexOf("Aula em vídeo") < text.indexOf("Linhas práticas"), text);
  assert.match(text, /Aula em vídeo/);
  assert.match(text, /Linhas práticas/);
  assert.match(text, /Novo/);
});

test("Todos os capítulos returns to the grid", () => {
  const c = view();
  const back = [...c.querySelectorAll("a")].find((link) => link.textContent === "Todos os capítulos");
  assert.equal(back?.getAttribute("href"), "/courses/caro");
});

test("one line card per line, in chapter order, opening the lesson", () => {
  const c = view();
  const lineLinks = [...c.querySelectorAll("ul[aria-label='Linhas práticas'] li a")];
  assert.deepEqual(
    lineLinks.map((link) => link.getAttribute("href")),
    ["/courses/caro/a", "/courses/caro/b"],
  );
  const texts = lineLinks.map((link) => link.textContent ?? "");
  assert.match(texts[0], /Linha 1/);
  assert.match(texts[0], /Variante Najdorf/);
  assert.match(texts[1], /Linha 2/);
  assert.match(texts[1], /Variante Dragão/);
});

test("a chapter without a video keeps the track but renders no embed", () => {
  const c = view({ value: { ...chapter, videoUrl: undefined, description: undefined, hasVideo: false } });
  assert.equal(c.querySelector("iframe"), null);
  assert.equal(c.querySelector("video"), null);
  assert.match(c.textContent ?? "", /Aula em vídeo/);
  assert.ok(!(c.textContent ?? "").includes("Plano do capítulo."));
});

test("chapter view labels render in English too", () => {
  const text = view({ locale: "en" }).textContent ?? "";
  assert.match(text, /Chapter 2/);
  assert.match(text, /All chapters/);
  assert.match(text, /Video lesson/);
  assert.match(text, /Practice lines/);
  assert.match(text, /New/);
});
