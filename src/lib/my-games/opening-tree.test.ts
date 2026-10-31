// SIG-1048: fixture tests for the opening-tree pure core. Every assertion
// is hand-computed; boundaries (trend edges, flagging thresholds) are exact.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildOpeningTree,
  worstLines,
  type OpeningNode,
  type OpeningTreeGame,
} from "./opening-tree.ts";

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

function findChild(node: OpeningNode, san: string): OpeningNode {
  const child = node.children.find((c) => c.san === san);
  assert.ok(child, `missing child ${san}`);
  return child;
}

describe("buildOpeningTree totals", () => {
  it("aggregates the filtered color at the root with exact W/D/L and score", () => {
    const games = [
      game({ sans: ["e4", "e5"], result: "win", accuracy: 80 }),
      game({ sans: ["e4", "e5"], result: "draw", accuracy: 70 }),
      game({ sans: ["d4", "d5"], result: "loss", accuracy: 60 }),
      game({ sans: ["e4"], result: null, accuracy: null }),
      game({ sans: ["e4", "c5"], color: "black", result: "win" }),
    ];
    const root = buildOpeningTree(games, { color: "white", now: NOW });
    assert.equal(root.games, 4);
    assert.equal(root.wins, 1);
    assert.equal(root.draws, 1);
    assert.equal(root.losses, 1);
    // (1 + 0.5) / 4 = 37.5 -> 38.
    assert.equal(root.scorePct, 38);
    // Null accuracies never enter the mean: (80 + 70 + 60) / 3 = 70.
    assert.equal(root.avgAccuracy, 70);
    assert.equal(root.san, "");
    assert.equal(root.ply, 0);
    // Children sorted by games desc: e4 x3 before d4 x1.
    assert.deepEqual(
      root.children.map((c) => c.san),
      ["e4", "d4"],
    );
    const e4 = findChild(root, "e4");
    assert.equal(e4.games, 3);
    assert.equal(e4.ply, 1);
    // (1 + 0.5 + 0) / 3 = 50.
    assert.equal(e4.scorePct, 50);
    assert.equal(findChild(e4, "e5").games, 2);
  });

  it("reports avgAccuracy null when no game has an accuracy", () => {
    const root = buildOpeningTree([game({ sans: ["e4"] })], { color: "white", now: NOW });
    assert.equal(root.avgAccuracy, null);
    assert.equal(findChild(root, "e4").avgAccuracy, null);
  });

  it("builds a 200-game 12-ply tree in under 100 ms with exact root totals", () => {
    const games: OpeningTreeGame[] = [];
    let expectedWins = 0;
    let expectedDraws = 0;
    for (let i = 0; i < 200; i += 1) {
      const result = i % 3 === 0 ? "win" : i % 3 === 1 ? "draw" : "loss";
      if (result === "win") {
        expectedWins += 1;
      } else if (result === "draw") {
        expectedDraws += 1;
      }
      games.push(
        game({
          sans: Array.from({ length: 12 }, (_, ply) => `m${(i + ply) % 20}`),
          color: i % 2 === 0 ? "white" : "black",
          result,
          accuracy: 50 + (i % 50),
        }),
      );
    }
    const start = Date.now();
    const root = buildOpeningTree(games, { color: "white", now: NOW });
    assert.ok(Date.now() - start < 100, "12-ply tree over 200 games builds in under 100 ms");
    // Even indexes are white: 100 games.
    assert.equal(root.games, 100);
    assert.equal(root.wins + root.draws + root.losses, 100);
    const whiteWins = games.filter((g) => g.color === "white" && g.result === "win").length;
    const whiteDraws = games.filter((g) => g.color === "white" && g.result === "draw").length;
    assert.equal(root.wins, whiteWins);
    assert.equal(root.draws, whiteDraws);
    assert.equal(root.scorePct, Math.round((100 * (whiteWins + 0.5 * whiteDraws)) / 100));
    void expectedWins;
    void expectedDraws;
  });

  it("handles empty input, empty lines and maxPly truncation", () => {
    const empty = buildOpeningTree([], { color: "white", now: NOW });
    assert.equal(empty.games, 0);
    assert.equal(empty.scorePct, 0);
    assert.equal(empty.children.length, 0);
    assert.deepEqual([empty.trend.m1, empty.trend.m3, empty.trend.m6, empty.trend.m12], [null, null, null, null]);

    const withEmpty = buildOpeningTree([game({ sans: [] })], { color: "white", now: NOW });
    assert.equal(withEmpty.games, 1);
    assert.equal(withEmpty.children.length, 0);

    const deep = buildOpeningTree([game({ sans: ["e4", "e5", "Nf3", "Nc6"] })], {
      color: "white",
      now: NOW,
      maxPly: 2,
    });
    assert.equal(deep.games, 1);
    const e4 = findChild(deep, "e4");
    assert.equal(findChild(e4, "e5").children.length, 0);

    const zero = buildOpeningTree([game({ sans: ["e4"] })], { color: "white", now: NOW, maxPly: 0 });
    assert.equal(zero.games, 1);
    assert.equal(zero.children.length, 0);
  });
});

describe("buildOpeningTree trend windows", () => {
  // Calendar-month cutoffs from NOW (2026-10-31), clamped to the last day
  // of the target month: m1 >= 2026-09-30, m3 >= 2026-07-31,
  // m6 >= 2026-04-30, m12 >= 2025-10-31.
  const m1 = Date.UTC(2026, 9, 15);
  const m3edge = Date.UTC(2026, 6, 31, 12);
  const m3older = m3edge - 1;
  const m6 = Date.UTC(2026, 3, 30, 12);
  const m12 = Date.UTC(2025, 9, 31, 12);
  const older = Date.UTC(2025, 9, 30, 12);

  it("includes the exact 3-month boundary game in m3 and excludes the ms before it", () => {
    const games = [
      game({ sans: ["e4"], playedAt: m1, result: "win" }),
      game({ sans: ["e4"], playedAt: m3edge, result: "loss" }),
      game({ sans: ["e4"], playedAt: m3older, result: "win" }),
      game({ sans: ["e4"], playedAt: m6, result: "draw" }),
      game({ sans: ["e4"], playedAt: m12, result: "loss" }),
      game({ sans: ["e4"], playedAt: older, result: "win" }),
      game({ sans: ["e4"], playedAt: null, result: "win" }),
    ];
    const root = buildOpeningTree(games, { color: "white", now: NOW });
    // Null timestamps count in totals but in no window.
    assert.equal(root.games, 7);
    assert.deepEqual(root.trend.m1, { games: 1, scorePct: 100 });
    // m3: m1 game + boundary game: (1 + 0) / 2 = 50.
    assert.deepEqual(root.trend.m3, { games: 2, scorePct: 50 });
    // m6: + m3older win + m6 draw: (1 + 0 + 1 + 0.5) / 4 = 62.5 -> 63.
    assert.deepEqual(root.trend.m6, { games: 4, scorePct: 63 });
    // m12: + m12 loss: (2.5 + 0) / 5 = 50. `older` (one day before the
    // m12 cutoff) stays out of every window.
    assert.deepEqual(root.trend.m12, { games: 5, scorePct: 50 });
    // The node below aggregates the same windows.
    assert.deepEqual(findChild(root, "e4").trend.m3, { games: 2, scorePct: 50 });
  });

  it("reports null windows when no game falls inside", () => {
    const root = buildOpeningTree([game({ sans: ["e4"], playedAt: older })], { color: "white", now: NOW });
    assert.deepEqual([root.trend.m1, root.trend.m3, root.trend.m6, root.trend.m12], [null, null, null, null]);
    assert.equal(root.games, 1);
  });
});

describe("buildOpeningTree filters", () => {
  const games = [
    game({ sans: ["e4"], timeClass: "blitz", rated: true, playedAt: 100, result: "win" }),
    game({ sans: ["e4"], timeClass: "rapid", rated: true, playedAt: 200, result: "win" }),
    game({ sans: ["e4"], timeClass: "blitz", rated: false, playedAt: 300, result: "loss" }),
    game({ sans: ["e4"], timeClass: "blitz", rated: null, playedAt: null, result: "win" }),
  ];

  it("filters by timeClass", () => {
    const root = buildOpeningTree(games, { color: "white", now: NOW, filters: { timeClass: "rapid" } });
    assert.equal(root.games, 1);
    assert.equal(root.wins, 1);
  });

  it("ratedOnly keeps only rated games", () => {
    const root = buildOpeningTree(games, { color: "white", now: NOW, filters: { ratedOnly: true } });
    assert.equal(root.games, 2);
  });

  it("applies inclusive from/to bounds, letting null timestamps through", () => {
    const root = buildOpeningTree(games, { color: "white", now: NOW, filters: { from: 200, to: 300 } });
    // Played 200, 300, plus the null-timestamp game.
    assert.equal(root.games, 3);
    const exact = buildOpeningTree(games, { color: "white", now: NOW, filters: { from: 200, to: 200 } });
    // Played exactly 200, plus the null-timestamp game.
    assert.equal(exact.games, 2);
  });
});

describe("worstLines", () => {
  it("flags below-threshold lines worst-first and respects exact boundaries", () => {
    const games: OpeningTreeGame[] = [
      // e4 e5: 5 games, 1W 1D 3L -> (1 + 0.5)/5 = 30 -> flagged.
      ...Array.from({ length: 5 }, (_, i) =>
        game({ sans: ["e4", "e5"], result: i === 0 ? "win" : i === 1 ? "draw" : "loss" }),
      ),
      // d4 d5: 5 games, 2W 3L -> 40 -> NOT flagged (strict <).
      ...Array.from({ length: 5 }, (_, i) => game({ sans: ["d4", "d5"], result: i < 2 ? "win" : "loss" })),
      // c4: 4 games, all losses -> 0 but below minGames -> NOT flagged.
      ...Array.from({ length: 4 }, () => game({ sans: ["c4"], result: "loss" })),
      // Nf3: 6 games, all losses -> 0 -> flagged, worst first.
      ...Array.from({ length: 6 }, () => game({ sans: ["Nf3"], result: "loss" })),
    ];
    const root = buildOpeningTree(games, { color: "white", now: NOW });
    const flagged = worstLines(root);
    // e4 (5 games, (1 + 0.5)/5 = 30%) flags before its same-score child
    // e4 e5 (also 5 games, suppressed as the same sample one ply deeper).
    assert.deepEqual(
      flagged.map((f) => f.path.join(" ")),
      ["Nf3", "e4"],
    );
    assert.equal(flagged[0]?.node.scorePct, 0);
    assert.equal(flagged[1]?.node.scorePct, 30);
    assert.equal(flagged[1]?.node.games, 5);
  });

  it("suppresses a flagged child with the same game count as its flagged parent", () => {
    const games = Array.from({ length: 5 }, () => game({ sans: ["e4", "e5"], result: "loss" }));
    const root = buildOpeningTree(games, { color: "white", now: NOW });
    // e4 (5 games, 0%) flags; e4 e5 has the same 5 games -> suppressed.
    const flagged = worstLines(root);
    assert.deepEqual(flagged.map((f) => f.path.join(" ")), ["e4"]);
  });

  it("keeps flagging deeper plies while the parent is unflagged", () => {
    const games = [
      ...Array.from({ length: 6 }, () => game({ sans: ["e4", "e5"], result: "loss" })),
      ...Array.from({ length: 5 }, () => game({ sans: ["e4", "c5"], result: "win" })),
    ];
    const root = buildOpeningTree(games, { color: "white", now: NOW });
    // e4: 11 games, 5/11 = 45 -> not flagged, so e4 e5 (6 games, 0%) flags.
    const flagged = worstLines(root);
    assert.deepEqual(flagged.map((f) => f.path.join(" ")), ["e4 e5"]);
  });

  it("honors custom minGames and maxScore", () => {
    const games = Array.from({ length: 4 }, () => game({ sans: ["e4"], result: "loss" }));
    const root = buildOpeningTree(games, { color: "white", now: NOW });
    assert.equal(worstLines(root).length, 0);
    const flagged = worstLines(root, { minGames: 4, maxScore: 40 });
    assert.deepEqual(flagged.map((f) => f.path.join(" ")), ["e4"]);
  });

  it("never flags the root", () => {
    const games = Array.from({ length: 10 }, () => game({ sans: ["e4"], result: "loss" }));
    const root = buildOpeningTree(games, { color: "white", now: NOW });
    assert.equal(root.scorePct, 0);
    const flagged = worstLines(root);
    assert.ok(flagged.every((f) => f.path.length > 0));
  });
});
