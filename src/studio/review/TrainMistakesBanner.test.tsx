import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";
import { setupDom, teardownDom } from "../../test-utils/dom.ts";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

before(() => setupDom());
after(() => teardownDom());
afterEach(() => cleanup());

const { TrainMistakesBanner } = await import("./TrainMistakesBanner.tsx");

test("renders Retry on board and Train now actions and invokes onStartRetry", () => {
  let retried = 0;
  render(
    <TrainMistakesBanner
      banner={{ count: 2, side: "w", lineId: "line-1" }}
      locale="en"
      onStartRetry={() => {
        retried += 1;
      }}
    />,
  );
  const banner = screen.getByTestId("train-mistakes-banner");
  assert.match(banner.textContent ?? "", /2 of White's mistakes became exercises/);

  const retryBtn = screen.getByRole("button", { name: "Retry on board" });
  const trainLink = screen.getByRole("link", { name: "Train now" });
  assert.equal(trainLink.getAttribute("href"), "/puzzles/play?mode=mistakes");

  fireEvent.click(retryBtn);
  assert.equal(retried, 1);

  fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
  assert.equal(screen.queryByTestId("train-mistakes-banner"), null);
});

test("omits Retry on board when onStartRetry is undefined and localizes to pt-BR", () => {
  const { rerender } = render(
    <TrainMistakesBanner banner={{ count: 1, side: "b", lineId: "line-2" }} locale="en" />,
  );
  assert.equal(screen.queryByRole("button", { name: "Retry on board" }), null);
  assert.ok(screen.getByRole("link", { name: "Train now" }));

  rerender(
    <TrainMistakesBanner
      banner={{ count: 1, side: "b", lineId: "line-2" }}
      locale="pt-br"
      onStartRetry={() => {}}
    />,
  );
  assert.ok(screen.getByRole("button", { name: "Refazer no tabuleiro" }));
  assert.ok(screen.getByRole("link", { name: "Treinar agora" }));
});
