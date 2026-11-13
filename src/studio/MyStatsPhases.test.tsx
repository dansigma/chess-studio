// SIG-1303: mistakes-by-phase section — tier colours, per-game averages, caption.
import { after, afterEach, before, test } from "node:test";
import assert from "node:assert/strict";
import { setupDom, teardownDom } from "../test-utils/dom.ts";
import { cleanup, render, screen } from "@testing-library/react";
import { emptyMistakeTotals, type MistakesPerGame } from "@/src/lib/my-games/stats";
import { MyStatsPhases } from "./MyStatsPhases";

before(() => setupDom());
afterEach(() => cleanup());
after(() => teardownDom());

const TIERS = ["inaccuracy", "mistake", "miss", "blunder"] as const;

function stats(reviewedGames: number): MistakesPerGame {
  const totals = emptyMistakeTotals();
  const perGame = emptyMistakeTotals();
  if (reviewedGames > 0) {
    totals.opening.inaccuracy = 14;
    perGame.opening.inaccuracy = 14 / reviewedGames;
    totals.endgame.blunder = 3;
    perGame.endgame.blunder = 3 / reviewedGames;
  }
  return { totals, perGame, reviewedGames };
}

test("uses one semantic tier colour token per tier", () => {
  render(<MyStatsPhases locale="en" stats={stats(20)} />);
  for (const tier of TIERS) {
    const bar = screen.getByTestId(`phase-bar-opening-${tier}`);
    assert.equal(bar.style.backgroundColor, `var(--studio-tier-${tier})`);
    const swatch = screen.getByTestId(`phase-swatch-endgame-${tier}`);
    assert.equal(swatch.style.backgroundColor, `var(--studio-tier-${tier})`);
  }
});

test("shows total, per-game average and the basis caption (en)", () => {
  render(<MyStatsPhases locale="en" stats={stats(20)} />);
  assert.ok(screen.getByText("14 · 0.7/game"));
  assert.ok(screen.getByText("3 · 0.2/game"));
  assert.equal(screen.getByTestId("mystats-phases-basis").textContent, "Based on 20 reviewed games");
});

test("pt-br uses comma decimals and Portuguese caption", () => {
  render(<MyStatsPhases locale="pt-br" stats={stats(20)} />);
  assert.ok(screen.getByText("14 · 0,7/partida"));
  assert.equal(screen.getByTestId("mystats-phases-basis").textContent, "Com base em 20 partidas revisadas");
});

test("0 reviewed games shows no averages", () => {
  render(<MyStatsPhases locale="en" stats={stats(0)} />);
  assert.equal(screen.queryByText(/\/game/), null);
  assert.equal(screen.getByTestId("mystats-phases-basis").textContent, "Based on 0 reviewed games");
});
