// SIG-1373: the Aprender summary shows moves, mistakes and the strategic plan.
import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";
import { setupDom, teardownDom } from "../../test-utils/dom.ts";
import { cleanup, render, screen } from "@testing-library/react";

before(() => setupDom());
after(() => teardownDom());
afterEach(() => cleanup());

const { LessonSummaryPanel } = await import("./LessonSummary.tsx");

test("summary lists moves, mistakes and the last comment in Portuguese", () => {
  const { container } = render(
    <LessonSummaryPanel
      locale="pt-br"
      moves={7}
      mistakes={2}
      comment="O plano é trocar o bispo e jogar ...e6."
    />,
  );
  screen.getByRole("heading", { name: "Linha concluída" });
  screen.getByText("Lances jogados: 7");
  screen.getByText("Erros: 2");
  screen.getByRole("heading", { name: "Plano estratégico" });
  screen.getByText("O plano é trocar o bispo e jogar ...e6.");
  assert.ok(container.querySelector("[data-lesson-summary]"));
});

test("summary omits an empty plan comment and renders English labels", () => {
  render(<LessonSummaryPanel locale="en" moves={0} mistakes={0} comment="" />);
  screen.getByRole("heading", { name: "Line complete" });
  screen.getByText("Moves played: 0");
  screen.getByText("Mistakes: 0");
  screen.getByRole("heading", { name: "Strategic plan" });
});
