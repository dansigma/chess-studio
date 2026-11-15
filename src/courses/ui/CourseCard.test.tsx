import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { setupDom, teardownDom } from "../../test-utils/dom.ts";
import { cleanup, render, screen } from "@testing-library/react";
import { CourseCard } from "./CourseCard.tsx";
import { nextLineId } from "../next-line.ts";
import type { CatalogCourse, VariationProgress } from "../types.ts";

before(() => {
  setupDom();
});

after(() => {
  teardownDom();
});

function course(overrides: Partial<CatalogCourse> = {}): CatalogCourse {
  return {
    id: "c1",
    slug: "caro-kann",
    title: "Caro-Kann",
    summary: "<p>Solid.</p>",
    theme: "openings",
    color: "black",
    accessTier: "free",
    priceCents: null,
    authorName: "Ana",
    level: "intermediate",
    eloMin: 1200,
    eloMax: 1800,
    language: "pt-br",
    durationMinutes: 200,
    chapterCount: 2,
    moveCount: 3,
    variationIds: ["a", "b", "c"],
    ...overrides,
  };
}

const learned = (learnedFlag: boolean) => ({ learned: learnedFlag }) as VariationProgress;

test("nextLineId returns the first line not learned, or null", () => {
  assert.equal(nextLineId(["a", "b"], {}), "a");
  assert.equal(nextLineId(["a", "b"], { a: learned(true) }), "b");
  assert.equal(nextLineId(["a", "b"], { a: learned(true), b: learned(true) }), null);
  assert.equal(nextLineId([], {}), null);
});

test("not started: metadata and a Começar link to the first line", () => {
  try {
    render(<CourseCard course={course()} locale="pt-br" progress={{}} ready />);
    assert.ok(screen.getByText("Intermediário"));
    assert.ok(screen.getByText(/Elo 1.200–1.800/));
    assert.ok(screen.getByText("por Ana"));
    assert.ok(screen.getByText(/2 capítulos · 3 linhas · ≈ 3 h 20 min/));
    assert.equal(screen.queryByRole("progressbar"), null);
    const start = screen.getByRole("link", { name: "Começar Caro-Kann" });
    assert.equal(start.getAttribute("href"), "/courses/caro-kann/a");
  } finally {
    cleanup();
  }
});

test("in progress: percent, progress bar and Continuar to the next line", () => {
  try {
    render(<CourseCard course={course()} locale="pt-br" progress={{ a: learned(true) }} ready />);
    assert.equal(screen.getByRole("progressbar").getAttribute("aria-valuenow"), "33");
    assert.ok(screen.getByText("33% concluído"));
    const link = screen.getByRole("link", { name: "Continuar Caro-Kann" });
    assert.equal(link.getAttribute("href"), "/courses/caro-kann/b");
  } finally {
    cleanup();
  }
});

test("all learned links to the course page", () => {
  try {
    render(
      <CourseCard course={course({ variationIds: ["a"] })} locale="en" progress={{ a: learned(true) }} ready />,
    );
    assert.equal(screen.getByRole("link", { name: "Continue Caro-Kann" }).getAttribute("href"), "/courses/caro-kann");
  } finally {
    cleanup();
  }
});

test("not ready: no progress and no action yet", () => {
  try {
    render(<CourseCard course={course()} locale="en" progress={{ a: learned(true) }} ready={false} />);
    assert.equal(screen.queryByRole("progressbar"), null);
    assert.equal(screen.queryByText(/complete/), null);
    assert.equal(screen.queryByRole("link", { name: /Start|Continue/ }), null);
  } finally {
    cleanup();
  }
});

test("missing optional fields: no author, Elo or duration", () => {
  try {
    render(
      <CourseCard
        course={course({
          authorName: undefined,
          eloMin: null,
          eloMax: null,
          durationMinutes: null,
          moveCount: 1,
          chapterCount: 1,
        })}
        locale="en"
        progress={{}}
        ready
      />,
    );
    assert.equal(screen.queryByText(/^by /), null);
    assert.equal(screen.queryByText(/Elo/), null);
    assert.ok(screen.getByText("1 chapter · 1 line"));
  } finally {
    cleanup();
  }
});
