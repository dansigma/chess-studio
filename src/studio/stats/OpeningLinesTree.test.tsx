// SIG-1329: OpeningLinesTree renders rows built from a hand-made games list,
// with the optional extra slots and open-line label override.
import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";
import { setupDom, teardownDom } from "../../test-utils/dom.ts";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { buildOpeningTree, worstLines, type OpeningTreeGame } from "../../lib/my-games/opening-tree.ts";
import { openingRows } from "../../lib/my-games/opening-rows.ts";

const { OpeningLinesTree } = await import("./OpeningLinesTree.tsx");

before(() => setupDom());
afterEach(() => cleanup());
after(async () => {
  await teardownDom();
});

function game(sans: string[], result: "win" | "draw" | "loss"): OpeningTreeGame {
  return { sans, color: "white", result, playedAt: 1, accuracy: null, timeClass: null, rated: null };
}

const games: OpeningTreeGame[] = [
  game(["e4", "e5", "Nf3"], "win"),
  game(["e4", "e5", "Nf3"], "loss"),
  game(["d4", "d5"], "loss"),
];

function rowsFor(expanded: ReadonlySet<string> = new Set()) {
  const root = buildOpeningTree(games, { color: "white", now: 1_000_000, filters: {} });
  const worst = new Set(worstLines(root).map((line) => line.path.join(" ")));
  return { root, rows: openingRows(root, expanded, worst) };
}

function props(overrides: Partial<Parameters<typeof OpeningLinesTree>[0]> = {}) {
  const { root, rows } = rowsFor();
  return {
    locale: "en" as const,
    lineColor: "white" as const,
    setLineColor: () => {},
    uiFilters: { timeClass: "all", ratedOnly: false, preset: "all" as const },
    setUiFilters: () => {},
    timeClasses: [],
    rows,
    totalGames: root.games,
    onToggle: () => {},
    onOpenLine: () => {},
    ...overrides,
  };
}

test("renders the line rows with an open-line button per row", () => {
  const opened: string[][] = [];
  render(<OpeningLinesTree {...props({ onOpenLine: (path) => opened.push(path) })} />);
  assert.ok(screen.getByText("1. e4"));
  assert.ok(screen.getByText("1. d4"));
  fireEvent.click(screen.getAllByRole("button", { name: "Open line" })[0]!);
  assert.equal(opened.length, 1);
});

test("expand toggle fires onToggle with the row key", () => {
  const toggled: string[] = [];
  render(<OpeningLinesTree {...props({ onToggle: (key) => toggled.push(key) })} />);
  fireEvent.click(screen.getByRole("button", { name: "1. e4" }));
  assert.deepEqual(toggled, ["e4"]);
});

test("openLineLabel overrides the button text and renderRowExtra renders both slots", () => {
  render(
    <OpeningLinesTree
      {...props({
        openLineLabel: "Study",
        renderRowExtra: (row) => ({
          trailing: <span>{`trail:${row.key}`}</span>,
          secondLine: <span>{`second:${row.key}`}</span>,
        }),
      })}
    />,
  );
  assert.equal(screen.queryByRole("button", { name: "Open line" }), null);
  assert.equal(screen.getAllByRole("button", { name: "Study" }).length, 2);
  assert.ok(screen.getByText("trail:e4"));
  assert.ok(screen.getByText("second:d4"));
});

test("empty rows show the empty hint", () => {
  render(<OpeningLinesTree {...props({ rows: [], totalGames: 0 })} />);
  assert.ok(screen.getByText(/./, { selector: "p" }));
});
