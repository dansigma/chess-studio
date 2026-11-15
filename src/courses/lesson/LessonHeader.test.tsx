// SIG-1370: the header shows "Variante X de Y" and one labelled link per line.
import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";
import { setupDom, teardownDom } from "../../test-utils/dom.ts";
import { cleanup, render, screen } from "@testing-library/react";

before(() => setupDom());
after(() => teardownDom());
afterEach(() => cleanup());

const { LessonHeader } = await import("./LessonHeader.tsx");

test("LessonHeader renders variant counter and clickable segments", () => {
  const { container, getByText } = render(
    <LessonHeader
      locale="pt-br"
      courseSlug="caro"
      courseTitle="Caro-Kann"
      chapterTitle="Avanço"
      lineTitle="Linha 2"
      mode="learn"
      segments={[
        { id: "a", index: 1, learned: true, current: false },
        { id: "b", index: 2, learned: false, current: true },
      ]}
      progress={{ a: { step: 3, learned: true } }}
    />,
  );
  getByText("Variante 2 de 2");
  getByText("Aprender");
  const links = [...container.querySelectorAll("a[data-segment]")];
  assert.deepEqual(
    links.map((a) => a.getAttribute("href")),
    ["/courses/caro/a", "/courses/caro/b"],
  );
  assert.equal(links[0].getAttribute("aria-label"), "Variante 1 de 2 — Aprendida");
  assert.equal(links[1].getAttribute("aria-current"), "step");
});

test("LessonHeader labels the Treinar mode", () => {
  render(
    <LessonHeader
      locale="pt-br"
      courseSlug="caro"
      courseTitle="Caro-Kann"
      chapterTitle="Avanço"
      lineTitle="Linha 2"
      mode="train"
      segments={[{ id: "a", index: 1, learned: true, current: true }]}
      progress={{ a: { step: 3, learned: true } }}
    />,
  );
  assert.ok(screen.getByText("Treinar"));
  assert.equal(screen.queryByText("Aprender"), null);
});
