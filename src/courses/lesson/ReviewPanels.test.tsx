// SIG-1375: the review header, the end-of-session summary and the empty state.
import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";
import { setupDom, teardownDom } from "../../test-utils/dom.ts";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReviewLineResult } from "./review-session.ts";

before(() => setupDom());
after(() => teardownDom());
afterEach(() => cleanup());

const { ReviewEmptyState, ReviewHeader, ReviewSummary } = await import(
  "./ReviewPanels.tsx"
);

const NOW = new Date("2026-01-10T12:00:00Z");
const DAY = 86_400_000;

const results: ReviewLineResult[] = [
  {
    variationId: "a",
    title: "Avanço",
    chapterTitle: "Capítulo um",
    mistakes: 0,
    dueAt: new Date(NOW.getTime() + 3 * DAY).toISOString(),
  },
  {
    variationId: "b",
    title: "Clássica",
    chapterTitle: "Capítulo dois",
    mistakes: 2,
    dueAt: new Date(NOW.getTime() + 4 * 3_600_000).toISOString(),
  },
];

test("header shows Revisão · X de N, Treinar and one segment per line", () => {
  const { container } = render(
    <ReviewHeader
      locale="pt-br"
      courseSlug="caro"
      courseTitle="Caro-Kann"
      lineTitle="Avanço"
      chapterTitle="Capítulo um"
      position={2}
      total={3}
      completed={1}
    />,
  );
  screen.getByText("Revisão · 2 de 3");
  screen.getByText("Treinar");
  screen.getByText("Capítulo um · Avanço");
  const bar = screen.getByRole("progressbar", { name: "Progresso da revisão" });
  assert.equal(bar.getAttribute("aria-valuenow"), "1");
  assert.equal(bar.getAttribute("aria-valuemax"), "3");
  const segments = [...container.querySelectorAll("[data-review-segment]")];
  assert.deepEqual(
    segments.map((segment) => segment.getAttribute("data-state")),
    ["done", "current", "pending"],
  );
});

test("summary lists every reviewed line with its result and next due date", () => {
  const { container } = render(
    <ReviewSummary
      locale="pt-br"
      courseSlug="caro"
      results={results}
      now={NOW}
    />,
  );
  screen.getByText("Revisão concluída");
  const lines = [...container.querySelectorAll("[data-review-summary-line]")];
  assert.deepEqual(
    lines.map((line) => line.textContent),
    [
      "AvançoCapítulo umSem errosPróxima revisão: em 3 dias",
      "ClássicaCapítulo dois2 errosPróxima revisão: em 4 horas",
    ],
  );
  const back = screen.getByRole("link", { name: "Voltar ao curso" });
  assert.equal(back.getAttribute("href"), "/courses/caro");
});

test("empty state says Nenhuma revisão pendente and links back to the course", () => {
  render(<ReviewEmptyState locale="pt-br" courseSlug="caro" />);
  screen.getByText("Revisão");
  screen.getByText("Nenhuma revisão pendente");
  const back = screen.getByRole("link", { name: "Voltar ao curso" });
  assert.equal(back.getAttribute("href"), "/courses/caro");
});
