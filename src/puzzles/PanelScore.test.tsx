import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { setupDom, teardownDom } from "../test-utils/dom.ts";
import { cleanup, render, screen } from "@testing-library/react";
import { PanelScore } from "./PanelScore.tsx";
import { LevelBar } from "./XpBreakdown.tsx";
import { levelFromXp } from "./xp.ts";

before(() => {
  setupDom();
});
after(() => {
  teardownDom();
});

const base = { solved: 3, streak: 2, strikes: 0, strikeLimit: 3 };

test("rated: the rating is the hero number with its delta, in en and pt-BR", () => {
  try {
    render(<PanelScore {...base} mode="rated" locale="en" rating={1889} delta={16} />);
    assert.equal(screen.getByTestId("panel-hero").textContent, "1,889");
    assert.equal(screen.getByTestId("panel-delta").textContent, "+16");
    assert.match(screen.getByTestId("panel-score").textContent ?? "", /Rating 1,889 \+16/);
    cleanup();
    render(<PanelScore {...base} mode="rated" locale="pt-br" rating={1889} delta={-4} />);
    assert.equal(screen.getByTestId("panel-hero").textContent, "1.889");
    assert.equal(screen.getByTestId("panel-delta").textContent, "-4");
  } finally {
    cleanup();
  }
});

test("rush and mistakes lead with the solved count, never XP or rating", () => {
  try {
    render(<PanelScore {...base} mode="mistakes" locale="en" rating={1889} delta={16} solved={12} />);
    assert.equal(screen.getByTestId("panel-hero").textContent, "12");
    assert.match(screen.getByTestId("panel-score").textContent ?? "", /^Solved 12/);
    assert.equal(screen.queryByTestId("panel-delta"), null);
  } finally {
    cleanup();
  }
});

test("the level line labels XP and groups thousands in en and pt-BR", () => {
  try {
    const level = levelFromXp(11747);
    render(<LevelBar level={level} locale="en" totalXp={11747} />);
    assert.equal(
      screen.getByTestId("level-line").textContent,
      `Level ${level.level} · 11,747 XP · ${level.toNext.toLocaleString("en-US")} to level ${level.level + 1}`,
    );
    cleanup();
    render(<LevelBar level={level} locale="pt-br" totalXp={11747} />);
    assert.equal(
      screen.getByTestId("level-line").textContent,
      `Nível ${level.level} · 11.747 XP · ${level.toNext.toLocaleString("pt-BR")} para o nível ${level.level + 1}`,
    );
  } finally {
    cleanup();
  }
});

test("without totalXp the level bar keeps the dashboard caption", () => {
  try {
    render(<LevelBar level={levelFromXp(140)} locale="en" compact />);
    assert.equal(screen.queryByTestId("level-line"), null);
    assert.ok(screen.getByText("90 XP to level 3"));
  } finally {
    cleanup();
  }
});
