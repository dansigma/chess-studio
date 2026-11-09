import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { setupDom, teardownDom } from "../test-utils/dom.ts";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ProgressHeatmap } from "./ProgressHeatmap.tsx";

before(() => {
  setupDom();
});
after(() => {
  teardownDom();
});

const days = {
  "2026-11-01": { solved: 12, failed: 2, ms: 600_000, xp: 0 },
  "2026-11-03": { solved: 1, failed: 0, ms: 60_000, xp: 0 },
};

test("renders streak, labelled squares, frozen marker and legend (en)", () => {
  try {
    render(<ProgressHeatmap days={days} today="2026-11-03" locale="en" />);
    screen.getByText("2-day streak");
    screen.getByText("Longest streak · 2 days");
    screen.getByText("2/7");
    screen.getByText("Less");
    screen.getByText("More");
    screen.getByText("One missed day per week does not break your streak.");
    const grid = screen.getByRole("grid");
    const cells = grid.querySelectorAll('[role="gridcell"][aria-label]');
    assert.equal(cells.length, 18 * 7 - 4); // Nov 4-7 are future days
    const busy = grid.querySelector('[aria-label^="Nov 1, 2026"]');
    assert.ok(busy);
    assert.match(busy.getAttribute("aria-label") ?? "", /14 puzzles \(12 correct, 2 failed\), 10 min/);
    assert.equal(busy.getAttribute("data-bucket"), "3");
    const frozen = grid.querySelector('[data-frozen="true"]');
    assert.ok(frozen);
    assert.match(frozen.getAttribute("aria-label") ?? "", /Streak freeze used/);
    // roving tabindex: exactly one tab stop
    assert.equal(grid.querySelectorAll('[tabindex="0"]').length, 1);
    // focus shows the day in the detail line
    fireEvent.focus(busy);
    assert.match(screen.getByTestId("heatmap-detail").textContent ?? "", /Nov 1, 2026/);
  } finally {
    cleanup();
  }
});

test("renders pt-BR strings", () => {
  try {
    render(<ProgressHeatmap days={days} today="2026-11-03" locale="pt-br" />);
    screen.getByText("Sequência de 2 dias");
    screen.getByText("Maior sequência · 2 dias");
  } finally {
    cleanup();
  }
});

test("weekday labels live outside the scroller; narrow width draws fewer weeks (SIG-1246)", () => {
  const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 212 });
  try {
    render(<ProgressHeatmap days={days} today="2026-11-03" locale="en" />);
    const scroller = screen.getByTestId("heatmap-scroller");
    const weekdays = screen.getByTestId("heatmap-weekdays");
    assert.equal(scroller.contains(weekdays), false);
    assert.equal(weekdays.textContent, "MonWedFri");
    // 212px / 15px per column = 14 weeks; every label is whole (not clipped)
    const grid = screen.getByRole("grid");
    assert.equal(grid.querySelectorAll('[role="row"]')[0].children.length, 14);
    assert.match(grid.getAttribute("aria-label") ?? "", /14/);
    assert.match(screen.getByText(/correct/, { selector: "span" }).textContent ?? "", /14 weeks/);
  } finally {
    if (original) {
      Object.defineProperty(HTMLElement.prototype, "clientWidth", original);
    } else {
      delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientWidth;
    }
    cleanup();
  }
});
