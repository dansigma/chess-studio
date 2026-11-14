// SIG-1306: accuracy trend chart — dots, tooltip, open, keyboard nav.
import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";
import { setupDom, teardownDom } from "../test-utils/dom.ts";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { PlayerGame } from "../lib/player-types.ts";
import { MyStatsTrend, clampCenter } from "./MyStatsTrend";

before(() => setupDom());
afterEach(() => cleanup());
after(() => teardownDom());

function g(id: string, playedAt: number, acc: number | null, extra: Partial<PlayerGame> = {}): PlayerGame {
  return {
    id, winner: null, whiteName: "Me", whiteRating: 1500, blackName: "Rival", blackRating: 1612,
    year: 2026, month: 10, event: null, eco: null, opening: null, color: "white", playerResult: "win",
    playedAt, rowId: null, userAccuracy: acc, opponentAccuracy: null,
    reviewedAt: acc == null ? null : "2026-10-01", mistakeCounts: null, timeClass: "blitz", ...extra,
  };
}
const GAMES = [
  g("a", Date.UTC(2026, 0, 5), 60),
  g("b", Date.UTC(2026, 1, 5), 80, { playerResult: "loss" }),
  g("c", Date.UTC(2026, 2, 5), 100),
  g("u", Date.UTC(2026, 3, 5), null),
];

test("renders a dot per reviewed game, labelled with mean and latest", () => {
  render(<MyStatsTrend games={GAMES} locale="en" onOpenGame={() => {}} />);
  assert.equal(screen.getAllByTestId("trend-dot").length, 3);
  const label = screen.getByTestId("mystats-trend").getAttribute("aria-label") ?? "";
  assert.match(label, /mean 80\.0/);
  assert.match(label, /latest 100\.0/);
  assert.equal(screen.getByTestId("trend-mean-label").textContent, "Mean 80.0");
});

test("renders nothing without reviewed games", () => {
  const { container } = render(<MyStatsTrend games={[GAMES[3]!]} locale="en" onOpenGame={() => {}} />);
  assert.equal(container.innerHTML, "");
});

test("hover and focus show the tooltip", () => {
  render(<MyStatsTrend games={GAMES} locale="pt-br" onOpenGame={() => {}} />);
  const dots = screen.getAllByTestId("trend-dot");
  fireEvent.mouseEnter(dots[1]!);
  let tip = screen.getByTestId("trend-tooltip").textContent ?? "";
  assert.match(tip, /Rival \(1612\)/);
  assert.match(tip, /Derrota/);
  assert.match(tip, /blitz/);
  assert.match(tip, /80,0/);
  fireEvent.mouseLeave(screen.getByTestId("mystats-trend"));
  assert.equal(screen.queryByTestId("trend-tooltip"), null);
  fireEvent.focus(dots[0]!);
  tip = screen.getByTestId("trend-tooltip").textContent ?? "";
  assert.match(tip, /Vitória/);
  assert.match(tip, /60,0/);
});

test("uses the opponent side for black games", () => {
  render(<MyStatsTrend games={[g("x", 1, 90, { color: "black" })]} locale="en" onOpenGame={() => {}} />);
  fireEvent.focus(screen.getByTestId("trend-dot"));
  assert.match(screen.getByTestId("trend-tooltip").textContent ?? "", /vs Me \(1500\)/);
});

test("click opens the game", () => {
  const opened: string[] = [];
  render(<MyStatsTrend games={GAMES} locale="en" onOpenGame={(game) => opened.push(game.id)} />);
  fireEvent.click(screen.getAllByTestId("trend-dot")[1]!);
  assert.deepEqual(opened, ["b"]);
});

test("roving tabindex and arrow keys move focus", () => {
  render(<MyStatsTrend games={GAMES} locale="en" onOpenGame={() => {}} />);
  const dots = screen.getAllByTestId("trend-dot");
  assert.deepEqual(dots.map((d) => d.getAttribute("tabindex")), ["-1", "-1", "0"]);
  dots[2]!.focus();
  fireEvent.keyDown(dots[2]!, { key: "ArrowLeft" });
  assert.equal(document.activeElement, dots[1]);
  fireEvent.keyDown(dots[1]!, { key: "Home" });
  assert.equal(document.activeElement, dots[0]);
  fireEvent.keyDown(dots[0]!, { key: "ArrowLeft" });
  assert.equal(document.activeElement, dots[0]);
  fireEvent.keyDown(dots[0]!, { key: "End" });
  assert.equal(document.activeElement, dots[2]);
});

test("clampCenter keeps a box inside the container (SIG-1308)", () => {
  assert.equal(clampCenter(5, 160, 400), 80);
  assert.equal(clampCenter(395, 160, 400), 320);
  assert.equal(clampCenter(200, 160, 400), 200);
  // Box wider than container: pinned left, never negative.
  assert.equal(clampCenter(50, 160, 100), 80);
});

function axisLabels(): string[] {
  return screen.getAllByTestId("trend-date-label").map((el) => el.textContent ?? "");
}

test("axis shows a single date when all games share a day (SIG-1335)", () => {
  const day = Date.UTC(2026, 9, 27, 12);
  const games = [g("a", day, 60), g("b", day + 3600_000, 80), g("c", day + 7200_000, 100)];
  render(<MyStatsTrend games={games} locale="en" onOpenGame={() => {}} />);
  assert.equal(axisLabels().length, 1);
  assert.equal(screen.getAllByTestId("trend-dot").length, 3);
});

test("axis drops the repeated date when only two labels match (SIG-1335)", () => {
  const day = Date.UTC(2026, 9, 27, 12);
  const games = [g("a", day, 60), g("b", day + 3600_000, 80), g("c", Date.UTC(2026, 10, 3), 100)];
  render(<MyStatsTrend games={games} locale="en" onOpenGame={() => {}} />);
  const labels = axisLabels();
  assert.equal(labels.length, 2);
  assert.notEqual(labels[0], labels[1]);
  // Per-game aria labels are untouched.
  const dots = screen.getAllByTestId("trend-dot");
  assert.equal(dots[0]!.getAttribute("aria-label"), `${labels[0]} — 60.0`);
  assert.equal(dots[1]!.getAttribute("aria-label"), `${labels[0]} — 80.0`);
});

test("axis keeps three labels for three distinct dates (SIG-1335)", () => {
  render(<MyStatsTrend games={GAMES} locale="en" onOpenGame={() => {}} />);
  const labels = axisLabels();
  assert.equal(labels.length, 3);
  assert.equal(new Set(labels).size, 3);
});
