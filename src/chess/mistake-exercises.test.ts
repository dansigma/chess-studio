import assert from "node:assert/strict";
import test from "node:test";
import { Chess } from "chess.js";
import { extractMistakeExercises, motifOf } from "./mistake-exercises.ts";
import { computeMoveFacts } from "./facts/index.ts";
import type { ReviewRow } from "./review-engine.ts";
import type { ReviewSide } from "./review-report.ts";
import { fenKey } from "./tree.ts";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const NOW = "2026-10-20T00:00:00.000Z";

function row(overrides: Partial<ReviewRow> & { index: number }): ReviewRow {
  return {
    side: "w",
    phase: "middlegame",
    label: "blunder",
    lossCp: 100,
    winLoss: 10,
    accuracy: 50,
    playedUci: "h2h3",
    bestPv: ["e2e4"],
    beforePawns: 0.5,
    afterPawns: -0.5,
    ...overrides,
  };
}

function extract(
  fens: string[],
  rows: ReviewRow[],
  userSide: ReviewSide = "w",
): ReturnType<typeof extractMistakeExercises> {
  return extractMistakeExercises({ fens, rows, userSide, now: NOW });
}

function replayLegal(fen: string, line: string[]): boolean {
  let board: Chess;
  try {
    board = new Chess(fen);
  } catch {
    return false;
  }
  for (const uci of line) {
    try {
      const move = board.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      if (!move) {
        return false;
      }
    } catch {
      return false;
    }
  }
  return true;
}

test("three user blunders and one opponent blunder yield three exercises", () => {
  const mate = "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1";
  const capture = "4k3/8/8/3p4/8/8/8/3RK3 w - - 0 1";
  const black = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
  const fens = [START, mate, capture, black];
  const rows = [
    row({ index: 0, playedUci: "d2d4", bestPv: ["e2e4"], lossCp: 60 }),
    row({ index: 1, label: "mistake", playedUci: "h2h3", bestPv: ["a1a8"], lossCp: 200 }),
    row({ index: 2, label: "miss", playedUci: "e1e2", bestPv: ["d1d5"], lossCp: 80 }),
    row({
      index: 3,
      side: "b",
      playedUci: "d7d5",
      bestPv: ["e7e5"],
      lossCp: 300,
    }),
  ];
  const exercises = extract(fens, rows);
  assert.equal(exercises.length, 3);
  assert.deepEqual(
    exercises.map((e) => e.fen),
    [START, mate, capture],
  );
});

test("a repeated position yields one exercise keeping the larger lossCp", () => {
  const mateEarly = "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1";
  const mateLate = "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 3 7";
  assert.equal(fenKey(mateEarly), fenKey(mateLate));
  const fens = [START, mateEarly, mateLate];
  const rows = [
    row({ index: 0, playedUci: "d2d4", bestPv: ["e2e4"], lossCp: 60 }),
    row({ index: 1, playedUci: "h2h3", bestPv: ["a1a8"], lossCp: 120 }),
    row({ index: 2, label: "mistake", playedUci: "h2h3", bestPv: ["a1a8"], lossCp: 250 }),
  ];
  const exercises = extract(fens, rows);
  assert.equal(exercises.length, 2);
  const repeated = exercises.find((e) => e.key === `mx:${fenKey(mateEarly)}`);
  assert.ok(repeated);
  assert.equal(repeated.lossCp, 250);
  assert.equal(repeated.fen, mateLate);
});

test("filters: wrong side, non-mistake labels, forced rows, and empty or matching lines", () => {
  const black = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
  const fens = [START, black];
  const rows = [
    row({ index: 0, side: "b", bestPv: ["e2e4"] }),
    row({ index: 0, label: "best", bestPv: ["e2e4"] }),
    row({ index: 0, label: "inaccuracy", bestPv: ["e2e4"] }),
    row({ index: 0, label: null, bestPv: ["e2e4"] }),
    row({ index: 0, forced: true, label: "blunder", bestPv: ["e2e4"] }),
    row({ index: 0, label: "blunder", bestPv: [] }),
    row({ index: 0, label: "mistake", playedUci: "e2e4", bestPv: ["e2e4", "e7e5"] }),
    row({ index: 9, label: "blunder", bestPv: ["e2e4"] }),
  ];
  assert.deepEqual(extract(fens, rows), []);
});

test("trims lines to at most three plies and odd length", () => {
  const line5 = ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4"];
  const line4 = ["e2e4", "e7e5", "g1f3", "b8c6"];
  const line2 = ["e2e4", "e7e5"];
  const fens = [START];
  const rows = [
    row({ index: 0, playedUci: "d2d4", bestPv: line5, lossCp: 10 }),
    row({ index: 0, label: "mistake", playedUci: "a2a3", bestPv: line4, lossCp: 5 }),
  ];
  const exercises = extract(fens, rows);
  // Same start position: only the larger lossCp survives; the full legal
  // engine line is kept on bestPv while solutionUci is the ≤3-ply odd cut.
  assert.equal(exercises.length, 1);
  assert.deepEqual(exercises[0]?.solutionUci, ["e2e4", "e7e5", "g1f3"]);
  assert.deepEqual(exercises[0]?.bestPv, line5);

  const two = extract([START], [row({ index: 0, playedUci: "d2d4", bestPv: line2 })]);
  assert.deepEqual(two[0]?.solutionUci, ["e2e4"]);

  const four = extract([START], [row({ index: 0, playedUci: "d2d4", bestPv: line4 })]);
  assert.deepEqual(four[0]?.solutionUci, ["e2e4", "e7e5", "g1f3"]);

  const one = extract([START], [row({ index: 0, playedUci: "d2d4", bestPv: ["e2e4"] })]);
  assert.deepEqual(one[0]?.solutionUci, ["e2e4"]);
});

test("cuts the line at the first illegal move and skips fully illegal best moves", () => {
  const cut = extract(
    [START],
    [row({ index: 0, playedUci: "d2d4", bestPv: ["e2e4", "e7e5", "g1f3", "e2e5", "b8c6"] })],
  );
  assert.deepEqual(cut[0]?.solutionUci, ["e2e4", "e7e5", "g1f3"]);
  assert.deepEqual(cut[0]?.bestPv, ["e2e4", "e7e5", "g1f3"]);

  const illegal = extract([START], [row({ index: 0, playedUci: "d2d4", bestPv: ["e2e5"] })]);
  assert.deepEqual(illegal, []);

  const garbage = extract(["garbage"], [row({ index: 0, playedUci: "d2d4", bestPv: ["e2e4"] })]);
  assert.deepEqual(garbage, []);
});

test("every solution has odd length and replays legally from its fen", () => {
  const fixtures: Array<{ fen: string; bestPv: string[]; side?: ReviewSide }> = [
    { fen: START, bestPv: ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4"] },
    { fen: START, bestPv: ["e2e4", "e7e5"] },
    { fen: "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1", bestPv: ["a1a8"] },
    {
      fen: "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3",
      bestPv: ["d8h4"],
      side: "b",
    },
    { fen: "r3k3/8/8/8/8/8/8/Q3K3 w - - 0 1", bestPv: ["a1a3"] },
    { fen: "4k3/8/8/3p4/8/8/8/3RK3 w - - 0 1", bestPv: ["d1d5"] },
    { fen: "4k3/8/8/8/8/1b6/NP6/4K3 w - - 0 1", bestPv: ["e1e2", "b3a2"] },
    { fen: "4k3/P7/8/8/8/8/8/4K3 w - - 0 1", bestPv: ["a7a8q"] },
    {
      fen: "2rq1rk1/R2n1ppp/4p3/2pb4/5B2/6P1/1Q2PPBP/3R2K1 w - - 0 21",
      bestPv: ["b2a1"],
    },
  ];
  for (const { fen, bestPv, side } of fixtures) {
    const [exercise] = extractMistakeExercises({
      fens: [fen],
      rows: [row({ index: 0, side: side ?? "w", playedUci: "zzz", bestPv })],
      userSide: side ?? "w",
      now: NOW,
    });
    assert.ok(exercise, `expected an exercise from ${fen} ${bestPv.join(" ")}`);
    assert.ok(
      exercise.solutionUci.length === 1 || exercise.solutionUci.length === 3,
      `odd length 1 or 3, got ${exercise.solutionUci.length}`,
    );
    assert.ok(
      replayLegal(fen, exercise.solutionUci),
      `${exercise.solutionUci.join(" ")} must replay from ${fen}`,
    );
  }
});

test("motifOf follows the documented precedence", () => {
  const mate = computeMoveFacts("6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1", "a1a8");
  assert.ok(mate);
  assert.equal(motifOf(mate), "mate");

  const fork = computeMoveFacts(
    "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3",
    "d8h4",
  );
  assert.ok(fork);
  assert.ok(fork.threats.created.some((t) => t.kind === "fork"));
  assert.equal(motifOf(fork), "fork");

  const winMaterial = computeMoveFacts("r3k3/8/8/8/8/8/8/Q3K3 w - - 0 1", "a1a3");
  assert.ok(winMaterial);
  assert.ok(
    winMaterial.threats.created.some(
      (t) => t.kind === "hanging-capture" || t.kind === "winning-capture" || t.kind === "mate-in-1",
    ),
  );
  assert.equal(motifOf(winMaterial), "win-material");

  const capture = computeMoveFacts("4k3/8/8/3p4/8/8/8/3RK3 w - - 0 1", "d1d5");
  assert.ok(capture);
  assert.equal(motifOf(capture), "capture");

  const sacrifice = computeMoveFacts("4k3/8/8/8/8/1b6/NP6/4K3 w - - 0 1", "e1e2", ["b3a2"]);
  assert.ok(sacrifice);
  assert.equal(motifOf(sacrifice), "sacrifice");

  const check = computeMoveFacts("4k3/P7/8/8/8/8/8/4K3 w - - 0 1", "a7a8q");
  assert.ok(check);
  assert.equal(motifOf(check), "check");

  const defense = computeMoveFacts(
    "2rq1rk1/R2n1ppp/4p3/2pb4/5B2/6P1/1Q2PPBP/3R2K1 w - - 0 21",
    "b2a1",
  );
  assert.ok(defense);
  assert.equal(motifOf(defense), "defense");

  const positional = computeMoveFacts(START, "e2e4");
  assert.ok(positional);
  assert.equal(motifOf(positional), "positional");
});

test("each motif is produced end to end from a review row", () => {
  const cases: Array<{ fen: string; bestPv: string[]; motif: string; side?: ReviewSide }> = [
    { fen: "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1", bestPv: ["a1a8"], motif: "mate" },
    {
      fen: "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3",
      bestPv: ["d8h4"],
      motif: "fork",
      side: "b",
    },
    { fen: "r3k3/8/8/8/8/8/8/Q3K3 w - - 0 1", bestPv: ["a1a3"], motif: "win-material" },
    { fen: "4k3/8/8/3p4/8/8/8/3RK3 w - - 0 1", bestPv: ["d1d5"], motif: "capture" },
    {
      fen: "4k3/8/8/8/8/1b6/NP6/4K3 w - - 0 1",
      bestPv: ["e1e2", "b3a2"],
      motif: "sacrifice",
    },
    { fen: "4k3/P7/8/8/8/8/8/4K3 w - - 0 1", bestPv: ["a7a8q"], motif: "check" },
    {
      fen: "2rq1rk1/R2n1ppp/4p3/2pb4/5B2/6P1/1Q2PPBP/3R2K1 w - - 0 21",
      bestPv: ["b2a1"],
      motif: "defense",
    },
    { fen: START, bestPv: ["e2e4"], motif: "positional" },
  ];
  const seen = new Set<string>();
  for (const { fen, bestPv, motif, side } of cases) {
    const [exercise] = extractMistakeExercises({
      fens: [fen],
      rows: [
        row({
          index: 0,
          side: side ?? "w",
          label: "blunder",
          playedUci: "zzz",
          bestPv,
          phase: "middlegame",
          lossCp: 150,
          beforePawns: 1,
          afterPawns: -1,
        }),
      ],
      userSide: side ?? "w",
      now: NOW,
    });
    assert.ok(exercise, `expected a ${motif} exercise`);
    assert.equal(exercise.motif, motif);
    assert.equal(exercise.label, "blunder");
    assert.equal(exercise.phase, "middlegame");
    assert.equal(exercise.lossCp, 150);
    assert.equal(exercise.beforePawns, 1);
    assert.equal(exercise.afterPawns, -1);
    assert.equal(exercise.createdAt, NOW);
    assert.equal(exercise.key, `mx:${fenKey(fen)}`);
    seen.add(exercise.motif);
  }
  assert.deepEqual(
    [...seen].sort(),
    ["capture", "check", "defense", "fork", "mate", "positional", "sacrifice", "win-material"],
  );
});

test("createdAt defaults to now and accepts a Date", () => {
  const [fromString] = extractMistakeExercises({
    fens: [START],
    rows: [row({ index: 0, playedUci: "d2d4", bestPv: ["e2e4"] })],
    userSide: "w",
    now: NOW,
  });
  assert.equal(fromString?.createdAt, NOW);

  const date = new Date("2026-10-21T00:00:00.000Z");
  const [fromDate] = extractMistakeExercises({
    fens: [START],
    rows: [row({ index: 0, playedUci: "d2d4", bestPv: ["e2e4"] })],
    userSide: "w",
    now: date,
  });
  assert.equal(fromDate?.createdAt, "2026-10-21T00:00:00.000Z");

  const [fallback] = extractMistakeExercises({
    fens: [START],
    rows: [row({ index: 0, playedUci: "d2d4", bestPv: ["e2e4"] })],
    userSide: "w",
  });
  assert.ok(fallback?.createdAt);
  assert.ok(!Number.isNaN(Date.parse(fallback?.createdAt ?? "")));
});
