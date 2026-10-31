// SIG-1099: fixture tests for the Openings-tab pure helpers. Every boundary
// is hand-computed; the perf test uses the same generous-bound style as the
// 200-game/<100 ms case in `opening-tree.test.ts`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { importSans } from "@/src/chess/pgn.ts";
import {
  buildOpeningTree,
  worstLines,
  type OpeningTreeGame,
} from "./opening-tree.ts";
import {
  openingFilterToTreeFilters,
  openingRows,
  OPENING_MAX_GAMES,
  syntheticLineGame,
  timeClassOptions,
} from "./opening-rows.ts";

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

describe("openingRows flattening", () => {
  it("emits only depth-0 rows when nothing is expanded", () => {
    const root = buildOpeningTree(
      [game({ sans: ["e4", "e5"] }), game({ sans: ["d4", "d5"] })],
      { color: "white", now: NOW },
    );
    const rows = openingRows(root, new Set());
    // Children sort by games desc, ties alphabetically: d4 before e4.
    assert.deepEqual(rows.map((r) => r.san), ["d4", "e4"]);
    assert.ok(rows.every((r) => r.depth === 0));
    assert.ok(rows.every((r) => r.hasChildren));
    assert.ok(rows.every((r) => !r.expanded));
    assert.deepEqual(rows.map((r) => r.key), ["d4", "e4"]);
  });

  it("expands children pre-order with depth, keys and numbered SAN", () => {
    const root = buildOpeningTree(
      [game({ sans: ["e4", "e5", "Nf3"] }), game({ sans: ["e4", "e5", "Bc4"] }), game({ sans: ["e4", "c5"] })],
      { color: "white", now: NOW },
    );
    const rows = openingRows(root, new Set(["e4", "e4 e5"]));
    // e5 (2 games) before c5 (1 game); Bc4 before Nf3 alphabetically.
    assert.deepEqual(
      rows.map((r) => r.key),
      ["e4", "e4 e5", "e4 e5 Bc4", "e4 e5 Nf3", "e4 c5"],
    );
    assert.deepEqual(
      rows.map((r) => r.depth),
      [0, 1, 2, 2, 1],
    );
    assert.equal(rows[0]?.expanded, true);
    assert.equal(rows[1]?.hasChildren, true);
    assert.equal(rows[1]?.expanded, true);
    assert.equal(rows[2]?.hasChildren, false);
    assert.equal(rows[2]?.expanded, false);
    // Full path with move numbers.
    assert.equal(rows[1]?.numberedSan, "1. e4 e5");
    assert.equal(rows[3]?.numberedSan, "1. e4 e5 2. Nf3");
  });

  it("flags exactly the worstLines paths", () => {
    const games = [
      ...Array.from({ length: 6 }, () => game({ sans: ["e4", "e5"], result: "loss" })),
      ...Array.from({ length: 5 }, () => game({ sans: ["d4", "d5"], result: "win" })),
    ];
    const root = buildOpeningTree(games, { color: "white", now: NOW });
    const worst = new Set(worstLines(root).map((w) => w.path.join(" ")));
    assert.ok(worst.size > 0);
    const rows = openingRows(root, new Set(["e4", "d4"]), worst);
    for (const row of rows) {
      assert.equal(row.isWorst, worst.has(row.key));
    }
  });
});

describe("openingFilterToTreeFilters", () => {
  const games: OpeningTreeGame[] = [
    game({ sans: ["e4"], timeClass: "blitz", rated: true, playedAt: Date.UTC(2026, 9, 15), result: "win" }),
    game({ sans: ["e4"], timeClass: "rapid", rated: true, playedAt: Date.UTC(2026, 9, 15), result: "win" }),
    game({ sans: ["e4"], timeClass: "blitz", rated: false, playedAt: Date.UTC(2026, 9, 15), result: "loss" }),
    game({ sans: ["e4"], timeClass: "blitz", rated: true, playedAt: Date.UTC(2025, 9, 15), result: "draw" }),
  ];

  it("maps timeClass, ratedOnly and presets to buildOpeningTree totals", () => {
    const base = { timeClass: "all" as const, ratedOnly: false, preset: "all" as const };
    assert.equal(
      buildOpeningTree(games, { color: "white", now: NOW, filters: openingFilterToTreeFilters(base, NOW) }).games,
      4,
    );
    assert.equal(
      buildOpeningTree(
        games,
        { color: "white", now: NOW, filters: openingFilterToTreeFilters({ ...base, timeClass: "rapid" }, NOW) },
      ).games,
      1,
    );
    assert.equal(
      buildOpeningTree(
        games,
        { color: "white", now: NOW, filters: openingFilterToTreeFilters({ ...base, ratedOnly: true }, NOW) },
      ).games,
      3,
    );
    // m12 keeps the 2026 games, drops the 2025-10-15 one (cutoff 2025-10-31).
    assert.equal(
      buildOpeningTree(
        games,
        { color: "white", now: NOW, filters: openingFilterToTreeFilters({ ...base, preset: "m12" }, NOW) },
      ).games,
      3,
    );
    // m1 keeps the Oct-2026 games (cutoff 2026-09-30), drops the 2025 one.
    assert.equal(
      buildOpeningTree(
        games,
        { color: "white", now: NOW, filters: openingFilterToTreeFilters({ ...base, preset: "m1" }, NOW) },
      ).games,
      3,
    );
  });

  it("derives time-class options from the data", () => {
    assert.deepEqual(timeClassOptions(games), ["blitz", "rapid"]);
    assert.deepEqual(timeClassOptions([{ timeClass: null }, {}]), []);
  });
});

describe("syntheticLineGame", () => {
  it("carries the SAN path as moves and imports through the existing path", () => {
    const path = ["e4", "e5", "Nf3"];
    const line = syntheticLineGame(path, "black");
    assert.equal(line.moves, "e4 e5 Nf3");
    assert.equal(line.color, "black");
    const imported = importSans(line.moves?.split(" ") ?? []);
    assert.equal(imported.warnings.length, 0);
    // Mainline length equals the SAN path length.
    let cursor = imported.tree.children;
    let count = 0;
    while (cursor.length > 0) {
      cursor = cursor[0]?.children ?? [];
      count += 1;
    }
    assert.equal(count, path.length);
  });
});

describe("openingRows perf", () => {
  it("builds the tree and flattens the root level for 3000 games in under 200 ms", () => {
    assert.equal(OPENING_MAX_GAMES, 3000);
    const games: OpeningTreeGame[] = [];
    for (let i = 0; i < OPENING_MAX_GAMES; i += 1) {
      games.push(
        game({
          sans: [`m${i % 40}`, `m${(i + 1) % 40}`, `m${(i + 2) % 40}`],
          result: i % 3 === 0 ? "win" : i % 3 === 1 ? "draw" : "loss",
        }),
      );
    }
    const start = Date.now();
    const root = buildOpeningTree(games, { color: "white", now: NOW });
    const rows = openingRows(root, new Set());
    assert.ok(Date.now() - start < 200, "tree + root-level flatten over 3000 games in under 200 ms");
    assert.equal(
      rows.reduce((sum, row) => sum + row.node.games, 0),
      root.games,
    );
  });
});
