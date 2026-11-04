// SIG-1209: the retry card replaces the report summary while a retry is open.
import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, mock, test } from "node:test";
import { setupDom, teardownDom } from "../../test-utils/dom.ts";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { MistakeExercise } from "@/src/chess/mistake-exercises";
import type { RetryTarget } from "@/src/chess/retry";

before(() => setupDom());
after(() => teardownDom());
afterEach(() => cleanup());

const { RetryCard } = await import("./RetryCard.tsx");
const { useStudioStore } = await import("@/src/store/studio-store");
const { emptyBoard } = await import("@/src/store/slices/board-helpers");

const store = () => useStudioStore.getState();
const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function target(index: number, patch: Partial<MistakeExercise> = {}, parentPath: number[] = []): RetryTarget {
  return {
    index,
    parentPath,
    momentPath: [...parentPath, 0],
    exercise: {
      key: `mx:card-${index}`,
      fen: START,
      solutionUci: ["g1f3", "g8f6", "b1c3"],
      bestPv: ["g1f3", "g8f6", "b1c3"],
      playedUci: "a2a3",
      label: "blunder",
      phase: "opening",
      lossCp: 300,
      beforePawns: 0.2,
      afterPawns: -2.8,
      motif: "positional",
      createdAt: "2026-01-01T00:00:00.000Z",
      ...patch,
    },
  };
}

beforeEach(() => {
  useStudioStore.setState({
    boards: [emptyBoard("Card", "card-board")],
    activeBoardId: "card-board",
    mistakeExercises: {},
  });
  window.localStorage.clear();
});
afterEach(() => store().exitRetry({ restorePath: false }));

function renderCard() {
  return render(<RetryCard locale="en" moveNotation="english" startFen={START} />);
}

test("renders nothing without an active retry", () => {
  const { container } = renderCard();
  assert.equal(container.innerHTML, "");
});

test("thinking: context, message and the three actions", () => {
  store().startRetry(target(0), [target(0)]);
  renderCard();
  assert.ok(screen.getByText("White to play · Blunder on move 1"));
  assert.ok(screen.getByText("Find the best move."));
  for (const name of ["Hint", "Show solution", "Exit"]) {
    assert.ok(screen.getByRole("button", { name }), name);
  }
  assert.equal(screen.queryByRole("button", { name: "Next mistake" }), null);
  assert.equal(screen.queryByText(/Free practice/), null);
});

test("Hint marks the from-square and counts as used; Exit closes the retry", () => {
  store().startRetry(target(0));
  renderCard();
  fireEvent.click(screen.getByRole("button", { name: "Hint" }));
  const retry = store().retry;
  assert.ok(retry.active && retry.hintUsed && retry.hintSquare === "g1");
  fireEvent.click(screen.getByRole("button", { name: "Exit" }));
  assert.equal(store().retry.active, false);
});

test("wrong move shows the retry message, the game move shows the special one", () => {
  store().startRetry(target(0));
  renderCard();
  act(() => {
    store().retryMove("d2", "d4");
  });
  assert.ok(screen.getByText("Not this one. Try again."));
  cleanup();
  store().exitRetry();
  store().startRetry(target(0));
  renderCard();
  act(() => {
    store().retryMove("a2", "a3");
  });
  assert.ok(screen.getByText("That was the game move. Try another."));
});

test("solved first try names the move; solved after a miss says it comes back", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  store().startRetry(target(0, { solutionUci: ["g1f3"], bestPv: ["g1f3"] }), [target(0), target(1)]);
  renderCard();
  act(() => {
    store().retryMove("g1", "f3");
  });
  assert.ok(screen.getByText("Correct! Nf3 was best."));
  assert.ok(screen.getByRole("button", { name: "Next mistake" }));
  assert.equal(screen.queryByRole("button", { name: "Hint" }), null);
  cleanup();
  store().exitRetry();

  store().startRetry(target(0, { solutionUci: ["g1f3"], bestPv: ["g1f3"] }));
  renderCard();
  act(() => {
    store().retryMove("d2", "d4");
    mock.timers.tick(600);
    store().retryMove("g1", "f3");
  });
  assert.ok(screen.getByText("Solved. It will come back in your review."));
  mock.timers.reset();
});

test("revealed shows the whole line and offers Insert into notation", () => {
  store().startRetry(target(0));
  renderCard();
  fireEvent.click(screen.getByRole("button", { name: "Show solution" }));
  assert.ok(screen.getByText("The best line was Nf3 Nf6 Nc3."));
  assert.ok(screen.getByRole("button", { name: "Insert into notation" }));
  assert.equal(
    (screen.getByRole("button", { name: "Next mistake" }) as HTMLButtonElement).disabled,
    true,
    "no later mistake in the queue",
  );
});

test("free practice is said on the card when the exercise already counted today", () => {
  store().startRetry(target(0, { solutionUci: ["g1f3"], bestPv: ["g1f3"] }));
  store().retryMove("g1", "f3");
  store().exitRetry();
  cleanup();
  store().startRetry(target(0, { solutionUci: ["g1f3"], bestPv: ["g1f3"] }));
  renderCard();
  assert.ok(screen.getByText("Already counted today. Free practice."));
});

test("pt-BR renders the localized card", () => {
  store().startRetry(target(0));
  render(<RetryCard locale="pt-br" moveNotation="english" startFen={START} />);
  assert.ok(screen.getByText("Brancas a jogar · Capivarada no lance 1"));
  assert.ok(screen.getByText("Encontre o melhor lance."));
  assert.ok(screen.getByRole("button", { name: "Ver solução" }));
});
