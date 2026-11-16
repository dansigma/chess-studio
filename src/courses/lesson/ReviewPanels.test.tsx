// SIG-1375: the review header, the end-of-session summary and the empty state.
import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";
import { setupDom, teardownDom } from "../../test-utils/dom.ts";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReviewLineResult } from "./review-session.ts";

before(() => setupDom());
after(() => teardownDom());
afterEach(() => cleanup());

const { ReviewEmptyState, ReviewHeader, ReviewSummary } = await import(
  "./ReviewPanels.tsx"
);

const NEXT = { id: "c1", title: "Panov", chapterTitle: "Capítulo três" };

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
      nextLine={NEXT}
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
  assertContinues();
});

/** SIG-1386: Continuar estudando first, Voltar ao curso second. */
function assertContinues() {
  screen.getByText("Próxima linha: Capítulo três · Panov");
  const links = screen.getAllByRole("link").filter((link) =>
    link.closest("[data-review-next]"),
  );
  assert.deepEqual(
    links.map((link) => [link.textContent, link.getAttribute("href")]),
    [
      ["Continuar estudando", "/courses/caro/c1"],
      ["Voltar ao curso", "/courses/caro"],
    ],
  );
}

/** SIG-1386: a fully learned course only links back, as complete. */
function assertCourseDone() {
  screen.getByText("Curso concluído: você já aprendeu todas as linhas.");
  assert.equal(screen.queryByRole("link", { name: "Continuar estudando" }), null);
  const back = screen.getByRole("link", { name: "Voltar ao curso" });
  assert.equal(back.getAttribute("href"), "/courses/caro");
}

test("summary of a fully learned course falls back to Voltar ao curso", () => {
  render(
    <ReviewSummary
      locale="pt-br"
      courseSlug="caro"
      nextLine={null}
      results={results}
      now={NOW}
    />,
  );
  assertCourseDone();
});

test("summary offers Revisar de novo while lines are still due", () => {
  let restarted = 0;
  render(
    <ReviewSummary
      locale="pt-br"
      courseSlug="caro"
      nextLine={NEXT}
      results={results}
      onReviewAgain={() => {
        restarted += 1;
      }}
      now={NOW}
    />,
  );
  assertContinues();
  fireEvent.click(screen.getByRole("button", { name: "Revisar de novo" }));
  assert.equal(restarted, 1);
});

test("summary hides Revisar de novo when nothing is due", () => {
  render(
    <ReviewSummary
      locale="pt-br"
      courseSlug="caro"
      nextLine={NEXT}
      results={results}
      now={NOW}
    />,
  );
  assert.equal(
    screen.queryByRole("button", { name: "Revisar de novo" }),
    null,
  );
});

test("summary of a learned course keeps Voltar ao curso and offers another round", () => {
  render(
    <ReviewSummary
      locale="pt-br"
      courseSlug="caro"
      nextLine={null}
      results={results}
      onReviewAgain={() => {}}
      now={NOW}
    />,
  );
  assertCourseDone();
  screen.getByRole("button", { name: "Revisar de novo" });
});

test("the review again action reads in English too", () => {
  render(
    <ReviewSummary
      locale="en"
      courseSlug="caro"
      nextLine={NEXT}
      results={results}
      onReviewAgain={() => {}}
      now={NOW}
    />,
  );
  screen.getByRole("button", { name: "Review again" });
});

test("empty state says Nenhuma revisão pendente and offers the next line", () => {
  render(<ReviewEmptyState locale="pt-br" courseSlug="caro" nextLine={NEXT} />);
  screen.getByText("Revisão");
  screen.getByText("Nenhuma revisão pendente");
  assertContinues();
});

test("empty state of a fully learned course falls back to Voltar ao curso", () => {
  render(<ReviewEmptyState locale="pt-br" courseSlug="caro" nextLine={null} />);
  assertCourseDone();
});

test("the next actions read in English too", () => {
  render(<ReviewEmptyState locale="en" courseSlug="caro" nextLine={NEXT} />);
  screen.getByText("Next line: Capítulo três · Panov");
  screen.getByRole("link", { name: "Continue studying" });
  screen.getByRole("link", { name: "Back to course" });
});
