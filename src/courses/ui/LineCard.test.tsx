import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";
import { setupDom, teardownDom } from "../../test-utils/dom.ts";
import { cleanup, render } from "@testing-library/react";
import type { CourseVariation, VariationProgress } from "../types.ts";

before(() => setupDom());
after(() => teardownDom());
afterEach(() => cleanup());

const { LineCard } = await import("./LineCard.tsx");

const NOW = new Date("2026-01-10T12:00:00Z");
const PAST = "2026-01-09T00:00:00Z";
const FUTURE = "2026-01-20T00:00:00Z";

const variations: CourseVariation[] = [
  { id: "a", title: "Abertura", pgn: "" },
  { id: "b", title: "Meio-jogo", pgn: "" },
  { id: "c", title: "Final", pgn: "" },
];

const progress: Record<string, VariationProgress> = {
  b: { step: 4, learned: true, reviewLevel: 1, reviewDueAt: FUTURE },
  c: { step: 4, learned: true, reviewLevel: 1, reviewDueAt: PAST },
};

function view(locale: "en" | "pt-br" = "pt-br") {
  return render(
    <ul>
      {variations.map((variation, index) => (
        <LineCard
          key={variation.id}
          courseSlug="caro"
          variation={variation}
          number={index + 1}
          progress={progress}
          locale={locale}
          now={NOW}
        />
      ))}
    </ul>,
  ).container;
}

test("line card shows the order, the title and the status badge", () => {
  const cards = [...view().querySelectorAll("li")];
  assert.equal(cards.length, 3);
  const texts = cards.map((card) => card.textContent ?? "");
  assert.match(texts[0], /1/);
  assert.match(texts[0], /Abertura/);
  assert.match(texts[0], /Novo/);
  assert.match(texts[1], /2/);
  assert.match(texts[1], /Meio-jogo/);
  assert.match(texts[1], /Aprendida/);
  assert.match(texts[2], /3/);
  assert.match(texts[2], /Final/);
  assert.match(texts[2], /Revisar/);
});

test("line card opens the lesson and exposes the order to screen readers", () => {
  const cards = [...view().querySelectorAll("li")];
  assert.deepEqual(
    cards.map((card) => card.querySelector("a")?.getAttribute("href")),
    ["/courses/caro/a", "/courses/caro/b", "/courses/caro/c"],
  );
  assert.match(cards[0].textContent ?? "", /Linha 1/);
  assert.equal(cards[0].querySelector("a [aria-hidden]")?.textContent, "1");
});

test("line badges render in English too", () => {
  const texts = [...view("en").querySelectorAll("li")].map((card) => card.textContent ?? "");
  assert.match(texts[0], /New/);
  assert.match(texts[1], /Learned/);
  assert.match(texts[2], /Review/);
});
