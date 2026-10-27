// SIG-1091: 12-game fixture proving every stats acceptance bullet with exact
// hand-computed numbers (wins/draws/losses + scorePct, <3-game exclusion,
// moving-average values, phase totals, stable ordering).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { importPgn } from "@/src/chess/pgn.ts";
import type { GameTree } from "@/src/chess/tree.ts";
import type { PlayerGame } from "@/src/lib/player-types.ts";
import type { DeviationPointEvent } from "./stats.ts";
import type { MistakeCounts } from "./review-queue.ts";
import {
  ACCURACY_TREND_WINDOW,
  accuracyTrend,
  aggregateDeviations,
  deviationsForRecentGames,
  emptyMistakeTotals,
  mistakesByPhase,
  MY_STATS_MIN_REVIEWED,
  myStatsViewState,
  RECENT_DEVIATION_WINDOW,
  resultsByOpening,
  type DeviationGroupEvent,
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

// SIG-1095: 8 hand-built events over 3 positions. Position A (user_deviation
// at the post-1.e4-e5 Nf3 square, 4 games, most recent playedAt 40) must
// rank first; position B (opponent_gap, 3 games, most recent playedAt 100)
// second by count despite the fresher timestamp; position C (1 game)
// last. Position A includes the same square with different move counters
// (halfmove 0 vs 4) to prove fenKey grouping.
const FEN_A = "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2";
const FEN_A_COUNTERS = "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 4 4";
const FEN_B = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
const FEN_C = "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3";

function pointEvent(overrides: Partial<DeviationPointEvent> & { kind: "user_deviation" | "opponent_gap" }): DeviationPointEvent {
  return {
    ply: 3,
    fen: FEN_A,
    playedUci: "f8c5",
    playedSan: "Bc5",
    repertoireMoves: [{ uci: "b8c6", san: "Nc6" }],
    ...overrides,
  };
}

const DEVIATION_FIXTURE: DeviationGroupEvent[] = [
  { event: pointEvent({ kind: "user_deviation", fen: FEN_A, playedSan: "Bc5", playedUci: "f8c5" }), gameId: "w01", playedAt: 10, color: "white" },
  { event: pointEvent({ kind: "user_deviation", fen: FEN_A, playedSan: "Bc5", playedUci: "f8c5" }), gameId: "w02", playedAt: 20, color: "white" },
  // Same square, different counters — must group with the two above.
  { event: pointEvent({ kind: "user_deviation", fen: FEN_A_COUNTERS, playedSan: "Bb4", playedUci: "f8b4" }), gameId: "w03", playedAt: 30, color: "white" },
  { event: pointEvent({ kind: "user_deviation", fen: FEN_A, playedSan: "Bc5", playedUci: "f8c5", repertoireMoves: [{ uci: "g8f6", san: "Nf6" }] }), gameId: "w04", playedAt: 40, color: "white" },
  { event: pointEvent({ kind: "opponent_gap", fen: FEN_B, playedSan: "c5", playedUci: "c7c5", ply: 1, repertoireMoves: [{ uci: "e7e5", san: "e5" }] }), gameId: "b01", playedAt: 50, color: "black" },
  { event: pointEvent({ kind: "opponent_gap", fen: FEN_B, playedSan: "d5", playedUci: "d7d5", ply: 1, repertoireMoves: [{ uci: "e7e5", san: "e5" }] }), gameId: "b02", playedAt: 60, color: "black" },
  { event: pointEvent({ kind: "opponent_gap", fen: FEN_B, playedSan: "c5", playedUci: "c7c5", ply: 1, repertoireMoves: [{ uci: "e7e5", san: "e5" }] }), gameId: "b03", playedAt: 100, color: "black" },
  { event: pointEvent({ kind: "user_deviation", fen: FEN_C, playedSan: "Bb5", playedUci: "f1b5", ply: 4 }), gameId: "w05", playedAt: 90, color: "white" },
];

describe("aggregateDeviations", () => {
  it("groups by fenKey with exact counts, labels, and count-then-recency order", () => {
    const rows = aggregateDeviations(DEVIATION_FIXTURE);
    assert.equal(rows.length, 3);
    // Position A first: 4 games despite an older most-recent timestamp.
    assert.equal(rows[0]?.count, 4);
    assert.equal(rows[0]?.kind, "user_deviation");
    assert.equal(rows[0]?.color, "white");
    assert.deepEqual(rows[0]?.gameIds, ["w01", "w02", "w03", "w04"]);
    // Most-recent event (w04, playedAt 40) owns the label + repertoire moves:
    // deviationLabel(FEN_A @ fullmove 2, black to move, Bc5) = "2…Bc5",
    // repertoireLabel(FEN_A, Nf6) = "2…Nf6".
    assert.equal(rows[0]?.label, "2…Bc5 instead of 2…Nf6");
    assert.deepEqual(rows[0]?.repertoireMoves, [{ uci: "g8f6", san: "Nf6" }]);
    assert.deepEqual(rows[0]?.playedMoves, [
      { san: "Bc5", count: 3 },
      { san: "Bb4", count: 1 },
    ]);
    // Position B second (3 games); gap label has no "instead of" suffix.
    assert.equal(rows[1]?.count, 3);
    assert.equal(rows[1]?.kind, "opponent_gap");
    assert.equal(rows[1]?.label, "1…c5");
    assert.deepEqual(rows[1]?.playedMoves, [
      { san: "c5", count: 2 },
      { san: "d5", count: 1 },
    ]);
    // Position C last (1 game).
    assert.equal(rows[2]?.count, 1);
    assert.equal(rows[2]?.label, "3. Bb5 instead of 3. Nc6");
  });

  it("orders equal counts by recency, then by key", () => {
    const rows = aggregateDeviations([
      { event: pointEvent({ kind: "user_deviation", fen: FEN_C, playedSan: "Bb5", playedUci: "f1b5", ply: 4 }), gameId: "n1", playedAt: 5, color: "white" },
      { event: pointEvent({ kind: "opponent_gap", fen: FEN_B, playedSan: "c5", playedUci: "c7c5", ply: 1, repertoireMoves: [{ uci: "e7e5", san: "e5" }] }), gameId: "n2", playedAt: 50, color: "black" },
    ]);
    assert.equal(rows.length, 2);
    assert.equal(rows[0]?.label, "1…c5", "fresher most-recent wins the count tie");
    assert.equal(rows[1]?.label, "3. Bb5 instead of 3. Nc6");
    assert.deepEqual(aggregateDeviations([]), [], "empty input yields no groups");
  });

  it("ignores none, line_ended, and never_entered events", () => {
    const ignored: DeviationGroupEvent[] = [
      { event: { kind: "none" }, gameId: "x1", playedAt: 1, color: "white" },
      {
        event: { kind: "line_ended", ply: 2, fen: FEN_A, playedUci: "f8c5", playedSan: "Bc5", repertoireMoves: [] },
        gameId: "x2",
        playedAt: 2,
        color: "white",
      },
      {
        event: { kind: "never_entered", ply: 1, fen: FEN_B, playedUci: "c7c5", playedSan: "c5", repertoireMoves: [] },
        gameId: "x3",
        playedAt: 3,
        color: "black",
      },
    ];
    assert.deepEqual(aggregateDeviations(ignored), []);
    assert.equal(
      aggregateDeviations([...ignored, ...DEVIATION_FIXTURE]).length,
      3,
      "ignored kinds never create or split groups",
    );
  });
});

function treeFromPgn(pgn: string): GameTree {
  const imported = importPgn(pgn);
  assert.equal(imported.warnings.length, 0, `PGN failed to import: ${imported.warnings}`);
  return imported.tree;
}

describe("deviationsForRecentGames", () => {
  it("uses only the 50 most recent games by date, oldest and nulls excluded", () => {
    assert.equal(RECENT_DEVIATION_WINDOW, 50);
    // Repertoire answers 1. e4 with 1…e5 only. Deviation PGNs play 1. d4
    // (user_deviation at the start position for White); the in-repertoire PGN
    // stays inside (kind none). The oldest game (w00, playedAt 1) and a
    // null-playedAt game use the deviating PGN — both must fall outside the
    // 50-game window (nulls sort as 0, oldest first).
    const whiteRep = treeFromPgn("1. e4 e5 *\n");
    const blackRep = treeFromPgn("1. e4 e5 *\n");
    const deviating = "1. d4 d5 *\n";
    const inside = "1. e4 e5 *\n";
    const fixtureGames: PlayerGame[] = [
      game({ id: "w00", color: "white", playedAt: 1, pgn: deviating }),
      ...Array.from({ length: 49 }, (_, index) =>
        game({ id: `m${String(index).padStart(2, "0")}`, color: "white", playedAt: 10 + index, pgn: inside }),
      ),
      ...Array.from({ length: 9 }, (_, index) =>
        game({ id: `d0${index}`, color: "white", playedAt: 60 + index, pgn: deviating }),
      ),
      game({ id: "null1", color: "white", playedAt: null, pgn: deviating }),
    ];
    // Shuffle the input order so the test proves order-independence: reverse
    // halves keep the sort honest (load order must not leak into the window).
    const shuffled = [...fixtureGames.slice(30), ...fixtureGames.slice(0, 30)];
    const rows = deviationsForRecentGames(shuffled, { white: whiteRep, black: blackRep });
    assert.equal(rows.length, 1, "all deviations share the start position");
    assert.equal(rows[0]?.count, 9, "only the 9 deviating games inside the window count");
    assert.ok(!rows[0]?.gameIds.includes("w00"), "51st-oldest game excluded");
    assert.ok(!rows[0]?.gameIds.includes("null1"), "null-playedAt game sorts outside the window");
    assert.equal(rows[0]?.kind, "user_deviation");
  });

  it("skips games with no repertoire for their color and missing PGNs", () => {
    const whiteRep = treeFromPgn("1. e4 e5 *\n");
    const rows = deviationsForRecentGames(
      [
        game({ id: "b1", color: "black", playedAt: 2, pgn: "1. e4 c5 *\n" }),
        game({ id: "w1", color: "white", playedAt: 3, pgn: undefined }),
        game({ id: "w2", color: "white", playedAt: 4, pgn: "   " }),
        game({ id: "w3", color: "white", playedAt: 5, pgn: "1. d4 d5 *\n" }),
      ],
      { white: whiteRep, black: null },
    );
    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0]?.gameIds, ["w3"]);
  });
});
