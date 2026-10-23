// SIG-1091: 12-game fixture proving every stats acceptance bullet with exact
// hand-computed numbers (wins/draws/losses + scorePct, <3-game exclusion,
// moving-average values, phase totals, stable ordering).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PlayerGame } from "@/src/lib/player-types.ts";
import type { MistakeCounts } from "./review-queue.ts";
import {
  ACCURACY_TREND_WINDOW,
  accuracyTrend,
  emptyMistakeTotals,
  mistakesByPhase,
  MY_STATS_MIN_REVIEWED,
  myStatsViewState,
  resultsByOpening,
} from "./stats.ts";

function counts(opening: number, middlegame: number, endgame: number): MistakeCounts {
  const phase = (n: number) => ({ inaccuracy: n, mistake: 0, miss: 0, blunder: 0 });
  return { opening: phase(opening), middlegame: phase(middlegame), endgame: phase(endgame) };
}

function game(overrides: Partial<PlayerGame> & { id: string }): PlayerGame {
  return {
    winner: null,
    whiteName: "User",
    whiteRating: null,
    blackName: "Opponent",
    blackRating: null,
    year: 2026,
    month: 10,
    event: null,
    eco: null,
    opening: null,
    color: "white",
    playerResult: null,
    playedAt: null,
    rowId: null,
    userAccuracy: null,
    opponentAccuracy: null,
    reviewedAt: null,
    mistakeCounts: null,
    ...overrides,
  };
}

// 12 games: 9 reviewed (accuracies 60..92) + 3 unreviewed; openings split
// across two qualifying groups (Italian/white ×4, Sicilian/black ×3), one
// near-miss group (French/white ×2, excluded), plus blanks/null openings.
// Reviewed mistake counts are triangular: game i (1-indexed) contributes
// i opening, 2i middlegame, 3i endgame inaccuracies.
const FIXTURE: PlayerGame[] = [
  game({ id: "g01", color: "white", playerResult: "win", playedAt: 1, opening: "Italian Game", userAccuracy: 60, reviewedAt: "2026-10-01", mistakeCounts: counts(1, 2, 3) }),
  game({ id: "g02", color: "white", playerResult: "loss", playedAt: 2, opening: "Italian Game", userAccuracy: 64, reviewedAt: "2026-10-02", mistakeCounts: counts(2, 4, 6) }),
  game({ id: "g03", color: "black", playerResult: "draw", playedAt: 3, opening: "Sicilian Defense", userAccuracy: 68, reviewedAt: "2026-10-03", mistakeCounts: counts(3, 6, 9) }),
  game({ id: "g04", color: "white", playerResult: "win", playedAt: 4, opening: "Italian Game", userAccuracy: 72, reviewedAt: "2026-10-04", mistakeCounts: counts(4, 8, 12) }),
  game({ id: "g05", color: "black", playerResult: "win", playedAt: 5, opening: "Sicilian Defense", userAccuracy: 76, reviewedAt: "2026-10-05", mistakeCounts: counts(5, 10, 15) }),
  game({ id: "g06", color: "white", playerResult: "draw", playedAt: 6, opening: "Italian Game", userAccuracy: 80, reviewedAt: "2026-10-06", mistakeCounts: counts(6, 12, 18) }),
  game({ id: "g07", color: "black", playerResult: "loss", playedAt: 7, opening: "Sicilian Defense", userAccuracy: 84, reviewedAt: "2026-10-07", mistakeCounts: counts(7, 14, 21) }),
  game({ id: "g08", color: "white", playerResult: "win", playedAt: 8, opening: "  French Defense  ", userAccuracy: 88, reviewedAt: "2026-10-08", mistakeCounts: counts(8, 16, 24) }),
  game({ id: "g09", color: "white", playerResult: "win", playedAt: 9, opening: "French Defense", userAccuracy: 92, reviewedAt: "2026-10-09", mistakeCounts: counts(9, 18, 27) }),
  // Unreviewed: excluded from the trend and phase totals, still counted in
  // the fixture size and in resultsByOpening (results need no review).
  game({ id: "g10", color: "white", playerResult: "win", playedAt: 10, opening: "Italian Game", mistakeCounts: counts(10, 20, 30) }),
  game({ id: "g11", color: "white", playerResult: null, playedAt: 11, opening: null }),
  game({ id: "g12", color: "black", playerResult: "loss", playedAt: 12, opening: "   " }),
];

describe("accuracyTrend", () => {
  it("averages the trailing window over reviewed games in date order", () => {
    const trend = accuracyTrend(FIXTURE, 3);
    // Reviewed accuracies in date order: 60,64,68,72,76,80,84,88,92.
    // Trailing-3 averages: 60, 62, 64, 68, 72, 76, 80, 84, 88.
    assert.deepEqual(
      trend.map((point) => point.accuracy),
      [60, 62, 64, 68, 72, 76, 80, 84, 88],
    );
    assert.deepEqual(
      trend.map((point) => point.playedAt),
      [1, 2, 3, 4, 5, 6, 7, 8, 9],
      "unreviewed games (playedAt 10-12) never enter the trend",
    );
  });

  it("defaults to a wide window and returns empty for no reviewed games", () => {
    assert.equal(ACCURACY_TREND_WINDOW, 10);
    const trend = accuracyTrend(FIXTURE);
    assert.equal(trend.length, 9);
    // Window covers everything seen so far: mean of all 9 reviewed = 76.
    assert.equal(trend[trend.length - 1]?.accuracy, 76);
    assert.deepEqual(accuracyTrend([]), []);
    assert.deepEqual(accuracyTrend(FIXTURE.slice(9)), [], "unreviewed-only input yields no points");
  });

  it("clamps degenerate window sizes instead of throwing", () => {
    // Window 0 / negative floors to 1: every point is its own accuracy.
    assert.deepEqual(
      accuracyTrend(FIXTURE, 0).map((point) => point.accuracy),
      [60, 64, 68, 72, 76, 80, 84, 88, 92],
    );
    // Fractional windows floor (2.9 -> 2).
    assert.deepEqual(
      accuracyTrend(FIXTURE.slice(0, 3), 2.9).map((point) => point.accuracy),
      [60, 62, 66],
    );
  });
});

describe("resultsByOpening", () => {
  it("groups by opening and color with exact W/D/L and scorePct", () => {
    const rows = resultsByOpening(FIXTURE);
    assert.deepEqual(rows, [
      // Italian/white: g01 W, g02 L, g04 W, g06 D, g10 W (unreviewed but
      // scored) -> 5 games, 3.5 pts -> 70%. French/white has only g08+g09
      // (whitespace-trimmed) -> 2 games, excluded by the <3-game rule.
      { opening: "Italian Game", color: "white", games: 5, wins: 3, draws: 1, losses: 1, scorePct: 70 },
      // Sicilian/black: D, W, L -> 3 games, 1.5 pts -> 50%.
      { opening: "Sicilian Defense", color: "black", games: 3, wins: 1, draws: 1, losses: 1, scorePct: 50 },
    ]);
  });

  it("drops groups under 3 games and skips blank openings", () => {
    const rows = resultsByOpening(FIXTURE);
    assert.equal(rows.length, 2, "French/white has only 2 games and must be excluded");
    assert.ok(!rows.some((row) => row.opening === "French Defense"));
    assert.ok(!rows.some((row) => row.opening === ""));
  });

  it("counts null results as games played with 0 points", () => {
    const rows = resultsByOpening([
      game({ id: "a", color: "white", playerResult: "win", opening: "London System" }),
      game({ id: "b", color: "white", playerResult: null, opening: "London System" }),
      game({ id: "c", color: "white", playerResult: null, opening: "London System" }),
    ]);
    assert.deepEqual(rows, [
      { opening: "London System", color: "white", games: 3, wins: 1, draws: 0, losses: 0, scorePct: 33 },
    ]);
  });

  it("sorts by games desc with deterministic tiebreaks", () => {
    const rows = resultsByOpening(FIXTURE);
    assert.deepEqual(
      rows.map((row) => `${row.opening}/${row.color}`),
      ["Italian Game/white", "Sicilian Defense/black"],
    );
  });
});

describe("mistakesByPhase", () => {
  it("sums reviewed mistake counts exactly once per game", () => {
    const totals = mistakesByPhase(FIXTURE);
    // Triangular fixture: reviewed games g01..g09 contribute i, 2i, 3i with
    // sum(i, 1..9) = 45 -> opening 45, middlegame 90, endgame 135.
    assert.equal(totals.opening.inaccuracy, 45);
    assert.equal(totals.middlegame.inaccuracy, 90);
    assert.equal(totals.endgame.inaccuracy, 135);
    assert.equal(
      totals.opening.mistake + totals.opening.miss + totals.opening.blunder,
      0,
      "fixture uses inaccuracies only",
    );
    // Internal consistency: the grand total equals the fixture's own sum
    // (every reviewed game's counts appear exactly once; g10's unreviewed
    // 10/20/30 never leaks in).
    const grand = (["opening", "middlegame", "endgame"] as const).reduce(
      (sum, phase) => sum + totals[phase].inaccuracy + totals[phase].mistake + totals[phase].miss + totals[phase].blunder,
      0,
    );
    assert.equal(grand, 45 + 90 + 135);
  });

  it("returns zeroed totals for empty or unreviewed input", () => {
    assert.deepEqual(mistakesByPhase([]), emptyMistakeTotals());
    assert.deepEqual(
      mistakesByPhase(FIXTURE.slice(9)),
      emptyMistakeTotals(),
      "unreviewed games (even with counts attached) contribute nothing",
    );
  });
});

describe("myStatsViewState", () => {
  it("requires 3 reviewed games before charts show", () => {
    assert.equal(MY_STATS_MIN_REVIEWED, 3);
    assert.equal(myStatsViewState(2), "empty");
    assert.equal(myStatsViewState(3), "ready");
    assert.equal(myStatsViewState(9), "ready");
  });
});
