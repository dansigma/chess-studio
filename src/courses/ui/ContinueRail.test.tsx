import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { setupDom, teardownDom } from "../../test-utils/dom.ts";
import { cleanup, render, screen } from "@testing-library/react";
import { ContinueRail } from "./ContinueRail.tsx";
import type { CatalogCourse, VariationProgress } from "../types.ts";

before(() => {
  setupDom();
});

after(() => {
  teardownDom();
});

const course: CatalogCourse = {
  id: "c1",
  slug: "caro-kann",
  title: "Caro-Kann",
  summary: "",
  theme: "openings",
  color: "black",
  accessTier: "free",
  priceCents: null,
  level: "beginner",
  eloMin: null,
  eloMax: null,
  language: "pt-br",
  durationMinutes: null,
  chapterCount: 1,
  moveCount: 2,
  variationIds: ["a", "b"],
  variationTitles: { a: "Avanço", b: "Clássica" },
};

const due: VariationProgress = {
  step: 3,
  learned: true,
  reviewLevel: 1,
  reviewDueAt: "2000-01-01T00:00:00Z",
  updatedAt: "2026-11-01T00:00:00Z",
};

test("signed in with progress: heading, next line, review chip as sibling links", () => {
  try {
    render(<ContinueRail courses={[course]} progress={{ a: due }} locale="pt-br" ready signedIn />);
    assert.ok(screen.getByRole("heading", { name: "Continuar estudando" }));
    assert.ok(screen.getByText("Próxima: Clássica"));
    const open = screen.getByRole("link", { name: "Continuar Caro-Kann" });
    assert.equal(open.getAttribute("href"), "/courses/caro-kann/b");
    const review = screen.getByRole("link", { name: /Revisar 1 linhas/ });
    assert.equal(review.getAttribute("href"), "/courses/caro-kann");
    assert.ok(screen.getByText("Revisar (1)"));
    assert.ok(!open.contains(review));
  } finally {
    cleanup();
  }
});

test("hidden for visitors, before ready, and without progress", () => {
  try {
    const { container, rerender } = render(
      <ContinueRail courses={[course]} progress={{ a: due }} locale="en" ready signedIn={false} />,
    );
    assert.equal(container.innerHTML, "");
    rerender(<ContinueRail courses={[course]} progress={{ a: due }} locale="en" ready={false} signedIn />);
    assert.equal(container.innerHTML, "");
    rerender(<ContinueRail courses={[course]} progress={{}} locale="en" ready signedIn />);
    assert.equal(container.innerHTML, "");
  } finally {
    cleanup();
  }
});

test("everything learned: links to the course page without Next", () => {
  try {
    render(
      <ContinueRail
        courses={[course]}
        progress={{ a: { step: 3, learned: true }, b: { step: 3, learned: true } }}
        locale="en"
        ready
        signedIn
      />,
    );
    assert.equal(screen.getByRole("link", { name: "Continue Caro-Kann" }).getAttribute("href"), "/courses/caro-kann");
    assert.equal(screen.queryByText(/Next:/), null);
    assert.equal(screen.queryByText(/Review \(/), null);
  } finally {
    cleanup();
  }
});
