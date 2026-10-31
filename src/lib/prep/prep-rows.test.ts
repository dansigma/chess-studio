// SIG-1101: fixture tests for the Opponent prep pure helpers. Every boundary
// is hand-computed; same grain as `opening-rows.test.ts`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { importSans } from "@/src/chess/pgn.ts";
import { buildOpeningTree, type OpeningNode, type OpeningTreeGame } from "@/src/lib/my-games/opening-tree.ts";
import { prepareAgainstLine, prepRows } from "./prep-rows.ts";

const NOW = Date.UTC(2026, 9, 31, 12, 0, 0, 0);

function game(overrides: Partial<OpeningTreeGame> & { sans: string[] }): OpeningTreeGame {
  return {
    color: "white",
    result: "win",
    playedAt: NOW,
    accuracy: null,
    timeClass: "blitz",
    rated: true,
    ...overrides,
  };
}

function emptyRoot(): OpeningNode {
  return {
    san: "",
    ply: 0,
    games: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    scorePct: 0,
    avgAccuracy: null,
    trend: { m1: null, m3: null, m6: null, m12: null },
    children: [],
  };
}

describe("prepRows flattening", () => {
  it("emits only depth-0 rows when nothing is expanded, with parent shares", () => {
    const root = buildOpeningTree(
      [
        ...Array.from({ length: 2 }, () => game({ sans: ["e4", "e5"] })),
        game({ sans: ["d4", "d5"] }),
      ],
      { color: "white", now: NOW },
    );
    const rows = prepRows(root, new Set());
    // Children sort by games desc: e4 (2) before d4 (1).
    assert.deepEqual(
      rows.map((r) => r.key),
      ["e4", "d4"],
    );
    assert.ok(rows.every((r) => r.depth === 0));
    assert.ok(rows.every((r) => !r.expanded));
    assert.deepEqual(
      rows.map((r) => r.sharePct),
      [67, 33],
    );
    assert.deepEqual(
      rows.map((r) => r.numberedSan),
      ["1. e4", "1. d4"],
    );
  });

  it("expands children pre-order with depth, keys and child-parent shares", () => {
    const root = buildOpeningTree(
      [game({ sans: ["e4", "e5", "Nf3"] }), game({ sans: ["e4", "e5", "Bc4"] }), game({ sans: ["e4", "c5"] })],
      { color: "white", now: NOW },
    );
    const rows = prepRows(root, new Set(["e4", "e4 e5"]));
    assert.deepEqual(
      rows.map((r) => r.key),
      ["e4", "e4 e5", "e4 e5 Bc4", "e4 e5 Nf3", "e4 c5"],
    );
    assert.deepEqual(
      rows.map((r) => r.depth),
      [0, 1, 2, 2, 1],
    );
    // e4 covers all 3 games; e5 covers 2 of e4's 3; Bc4/Nf3 split e5's 2.
    assert.deepEqual(
      rows.map((r) => r.sharePct),
      [100, 67, 50, 50, 33],
    );
    assert.equal(rows[0]?.expanded, true);
    assert.equal(rows[1]?.hasChildren, true);
    assert.equal(rows[1]?.expanded, true);
    assert.equal(rows[2]?.hasChildren, false);
    assert.equal(rows[3]?.numberedSan, "1. e4 e5 2. Nf3");
  });

  it("guards a zero-games root without throwing", () => {
    const rows = prepRows(emptyRoot(), new Set());
    assert.deepEqual(rows, []);
  });
});

describe("prepareAgainstLine", () => {
  it("orients to the user's side (opposite of the tree color)", () => {
    const againstWhite = prepareAgainstLine(["e4", "e5"], "white");
    assert.equal(againstWhite.orientation, "black");
    assert.equal(againstWhite.game.moves, "e4 e5");
    assert.equal(againstWhite.game.color, "black");
    const againstBlack = prepareAgainstLine(["e4", "c5"], "black");
    assert.equal(againstBlack.orientation, "white");
    assert.equal(againstBlack.game.moves, "e4 c5");
    assert.equal(againstBlack.game.color, "white");
  });

  it("carries a SAN path the board import accepts", () => {
    const { game: line } = prepareAgainstLine(["e4", "e5", "Nf3"], "white");
    const imported = importSans(line.moves?.split(" ") ?? []);
    assert.equal(imported.warnings.length, 0);
    let cursor = imported.tree.children;
    let count = 0;
    while (cursor.length > 0) {
      cursor = cursor[0]?.children ?? [];
      count += 1;
    }
    assert.equal(count, 3);
  });
});
