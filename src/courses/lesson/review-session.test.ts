// SIG-1375: the review session advances line by line and keeps every result.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  INITIAL_REVIEW_SESSION,
  reviewResultText,
  reviewSessionReducer,
  type ReviewLineResult,
  type ReviewSessionAction,
  type ReviewSessionState,
} from "./review-session.ts";

function result(id: string, mistakes: number): ReviewLineResult {
  return {
    variationId: id,
    title: id.toUpperCase(),
    chapterTitle: "Chapter",
    mistakes,
    dueAt: "2026-01-13T12:00:00Z",
  };
}

function run(actions: ReviewSessionAction[]): ReviewSessionState {
  return actions.reduce(reviewSessionReducer, INITIAL_REVIEW_SESSION);
}

describe("review session", () => {
  it("shows a result after each line and advances only on Continuar", () => {
    let state = run([{ type: "finish", result: result("a", 0), total: 2 }]);
    assert.equal(state.phase, "result");
    assert.equal(state.index, 0);
    assert.deepEqual(state.results.map((entry) => entry.variationId), ["a"]);

    state = reviewSessionReducer(state, { type: "next", total: 2 });
    assert.equal(state.phase, "line");
    assert.equal(state.index, 1);

    state = reviewSessionReducer(state, {
      type: "finish",
      result: result("b", 2),
      total: 2,
    });
    assert.equal(state.phase, "result");
    assert.deepEqual(
      state.results.map((entry) => [entry.variationId, entry.mistakes]),
      [
        ["a", 0],
        ["b", 2],
      ],
    );

    state = reviewSessionReducer(state, { type: "next", total: 2 });
    assert.equal(state.phase, "summary");
    assert.equal(state.index, 1);
  });

  it("keeps the summary data of every reviewed line", () => {
    const state = run([
      { type: "finish", result: result("a", 1), total: 2 },
      { type: "next", total: 2 },
      { type: "finish", result: result("b", 0), total: 2 },
    ]);
    assert.deepEqual(state.results, [
      {
        variationId: "a",
        title: "A",
        chapterTitle: "Chapter",
        mistakes: 1,
        dueAt: "2026-01-13T12:00:00Z",
      },
      {
        variationId: "b",
        title: "B",
        chapterTitle: "Chapter",
        mistakes: 0,
        dueAt: "2026-01-13T12:00:00Z",
      },
    ]);
  });

  it("ignores next outside a result", () => {
    const state = run([{ type: "next", total: 2 }]);
    assert.deepEqual(state, INITIAL_REVIEW_SESSION);
  });
});

describe("reviewResultText", () => {
  it("writes Sem erros / N erros and their English counterparts", () => {
    assert.equal(reviewResultText("pt-br", 0), "Sem erros");
    assert.equal(reviewResultText("pt-br", 1), "1 erro");
    assert.equal(reviewResultText("pt-br", 3), "3 erros");
    assert.equal(reviewResultText("en", 0), "No mistakes");
    assert.equal(reviewResultText("en", 1), "1 mistake");
    assert.equal(reviewResultText("en", 3), "3 mistakes");
  });
});
