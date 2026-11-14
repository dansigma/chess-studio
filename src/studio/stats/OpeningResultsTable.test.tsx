// SIG-1329: OpeningResultsTable renders a hand-built list of rows without any
// signed-in user data, and supports the optional row extras / row selection.
import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";
import { setupDom, teardownDom } from "../../test-utils/dom.ts";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { OpeningResult } from "../../lib/my-games/stats.ts";

const { OpeningResultsTable } = await import("./OpeningResultsTable.tsx");

before(() => setupDom());
afterEach(() => cleanup());
after(async () => {
  await teardownDom();
});

const rows: OpeningResult[] = [
  { opening: "Italian Game", color: "white", games: 6, wins: 3, draws: 0, losses: 3, scorePct: 50 },
  { opening: "Sicilian Defense", color: "white", games: 4, wins: 4, draws: 0, losses: 0, scorePct: 100 },
  { opening: "French Defense", color: "black", games: 3, wins: 0, draws: 0, losses: 3, scorePct: 0 },
];

function props(overrides: Partial<Parameters<typeof OpeningResultsTable>[0]> = {}) {
  return {
    locale: "en" as const,
    rows,
    color: "white" as const,
    onColorChange: () => {},
    sort: "games" as const,
    onSortChange: () => {},
    minGames: 3,
    onMinGamesChange: () => {},
    ...overrides,
  };
}

test("shows only the selected colour's rows and fires the callbacks", () => {
  const colors: string[] = [];
  const sorts: string[] = [];
  const mins: number[] = [];
  render(
    <OpeningResultsTable
      {...props({
        onColorChange: (c) => colors.push(c),
        onSortChange: (s) => sorts.push(s),
        onMinGamesChange: (n) => mins.push(n),
      })}
    />,
  );
  assert.ok(screen.getByText("Italian Game"));
  assert.ok(screen.getByText("Sicilian Defense"));
  assert.equal(screen.queryByText("French Defense"), null);
  fireEvent.click(screen.getByRole("tab", { name: "Black" }));
  fireEvent.click(screen.getByRole("button", { name: "Score" }));
  fireEvent.click(screen.getByRole("button", { name: "5" }));
  assert.deepEqual(colors, ["black"]);
  assert.deepEqual(sorts, ["score"]);
  assert.deepEqual(mins, [5]);
});

test("hideColorTabs removes the colour tabs", () => {
  render(<OpeningResultsTable {...props({ hideColorTabs: true })} />);
  assert.equal(screen.queryByRole("tab"), null);
});

test("renderRowExtra adds a trailing cell and a second line; onSelectRow makes names clickable", () => {
  const selected: string[] = [];
  render(
    <OpeningResultsTable
      {...props({
        renderRowExtra: (row) => ({
          trailing: <span>{`trail:${row.opening}`}</span>,
          secondLine: <span>{`second:${row.opening}`}</span>,
        }),
        onSelectRow: (row) => selected.push(row.opening),
      })}
    />,
  );
  assert.ok(screen.getByText("trail:Italian Game"));
  assert.ok(screen.getByText("second:Sicilian Defense"));
  fireEvent.click(screen.getByRole("button", { name: "Italian Game" }));
  assert.deepEqual(selected, ["Italian Game"]);
});

test("shows the empty state when no row matches", () => {
  render(<OpeningResultsTable {...props({ rows: [] })} />);
  assert.ok(screen.getByText("No Openings With Enough Games Yet."));
});
