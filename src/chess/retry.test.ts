import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MistakeExercise } from "./mistake-exercises.ts";
import type { ReviewRow } from "./review-engine.ts";
import {
  applyMove,
  buildRetryTargets,
  expectedUci,
  hint,
  markRecorded,
  outcomeToRecord,
  playReply,
  reveal,
  startRetry,
  type RetryState,
} from "./retry.ts";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
// White mates with Qxf7#.
const SCHOLAR = "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4";
// Back rank: both Ra8# and Rb8# mate.
const BACK_RANK = "6k1/5ppp/8/8/8/8/5PPP/RR4K1 w - - 0 1";

function exercise(patch: Partial<MistakeExercise>): MistakeExercise {
  return {
    key: "mx:test",
    fen: START,
    solutionUci: ["e2e4"],
    bestPv: ["e2e4"],
    playedUci: "a2a3",
    label: "blunder",
    phase: "opening",
    lossCp: 300,
    beforePawns: 0.2,
    afterPawns: -2.8,
    motif: "positional",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...patch,
  };
}

const ONE_PLY = exercise({});
const THREE_PLY = exercise({
  solutionUci: ["e2e4", "e7e5", "g1f3"],
  bestPv: ["e2e4", "e7e5", "g1f3"],
});
const MATE_IN_ONE = exercise({
  fen: SCHOLAR,
  solutionUci: ["h5f7"],
  bestPv: ["h5f7"],
  playedUci: "d2d3",
  motif: "mate",
});
const ALT_MATE = exercise({
  fen: BACK_RANK,
  solutionUci: ["a1a8"],
  bestPv: ["a1a8"],
  playedUci: "g1h1",
  motif: "mate",
});

function begin(ex: MistakeExercise, lastMove = ""): RetryState {
  const retry = startRetry(ex, lastMove);
  assert.ok(retry, "retry should start");
  return retry;
}

describe("startRetry", () => {
  it("starts thinking on the exercise position", () => {
    const retry = begin(ONE_PLY, "d7d5");
    assert.equal(retry.status, "thinking");
    assert.equal(retry.fen, START);
    assert.equal(retry.lastMove, "d7d5");
    assert.equal(retry.ply, 0);
    assert.equal(expectedUci(retry), "e2e4");
  });

  it("returns null for ineligible exercises", () => {
    assert.equal(startRetry(null), null);
    assert.equal(startRetry(exercise({ solutionUci: [] })), null);
    assert.equal(startRetry(exercise({ solutionUci: ["e2e4", "e7e5"] })), null, "even length");
    assert.equal(startRetry(exercise({ playedUci: "e2e4" })), null, "engine move equals the played move");
    assert.equal(startRetry(exercise({ solutionUci: ["e2e5"] })), null, "illegal line");
    assert.equal(startRetry(exercise({ fen: "not a fen" })), null);
  });
});

describe("first-try solve", () => {
  it("solves a 1-ply exercise and records correct", () => {
    const result = applyMove(begin(ONE_PLY), "e2", "e4");
    assert.equal(result.accepted, true);
    assert.equal(result.revert, false);
    assert.equal(result.reply, false);
    assert.equal(result.retry.status, "solved");
    assert.equal(result.retry.lastMove, "e2e4");
    assert.equal(outcomeToRecord(result.retry), "correct");
  });

  it("records nothing once recorded", () => {
    const solved = applyMove(begin(ONE_PLY), "e2", "e4").retry;
    assert.equal(outcomeToRecord(markRecorded(solved)), null);
  });
});

describe("wrong move", () => {
  it("flashes the wrong position, keeps the solver position and records incorrect", () => {
    const result = applyMove(begin(ONE_PLY), "d2", "d4");
    assert.equal(result.accepted, true);
    assert.equal(result.revert, true);
    assert.equal(result.reply, false);
    assert.equal(result.retry.status, "wrong");
    assert.equal(result.retry.fen, START, "the solver position is unchanged");
    assert.deepEqual(
      { from: result.flash?.from, to: result.flash?.to },
      { from: "d2", to: "d4" },
    );
    assert.match(result.flash?.fen ?? "", /^rnbqkbnr\/pppppppp\/8\/8\/3P4\/8\/PPP1PPPP/);
    assert.equal(result.retry.wrongGameMove, false);
    assert.equal(outcomeToRecord(result.retry), "incorrect");
  });

  it("there is no attempt limit", () => {
    let retry = begin(ONE_PLY);
    for (const to of ["a4", "b4", "c4", "d4"]) {
      const from = to.replace(/4$/, "2");
      const result = applyMove(retry, from, to);
      assert.equal(result.revert, true);
      retry = result.retry;
    }
    assert.equal(retry.status, "wrong");
    const solved = applyMove(retry, "e2", "e4").retry;
    assert.equal(solved.status, "solved");
  });

  it("wrong then solve still records incorrect, once", () => {
    const wrong = applyMove(begin(ONE_PLY), "d2", "d4").retry;
    assert.equal(outcomeToRecord(wrong), "incorrect");
    const recorded = markRecorded(wrong);
    const solved = applyMove(recorded, "e2", "e4").retry;
    assert.equal(solved.status, "solved");
    assert.equal(solved.missed, true);
    assert.equal(outcomeToRecord(solved), null, "already recorded at the first wrong move");
  });

  it("flags the move played in the game", () => {
    const retry = begin(ONE_PLY);
    const wrong = applyMove(retry, "a2", "a3");
    assert.equal(wrong.retry.wrongGameMove, true);
    const other = applyMove(wrong.retry, "d2", "d4");
    assert.equal(other.retry.wrongGameMove, false, "the flag follows the latest wrong move");
  });

  it("does not flag the game move on a later ply", () => {
    const afterFirst = playReply(applyMove(begin(exercise({ ...THREE_PLY, playedUci: "g1f3" })), "e2", "e4").retry);
    const wrong = applyMove(afterFirst, "g1", "f3");
    assert.equal(wrong.revert, false, "g1f3 is the engine move at ply 2");
    const reallyWrong = applyMove(afterFirst, "b1", "c3");
    assert.equal(reallyWrong.retry.wrongGameMove, false);
  });

  it("ignores illegal moves without changing state", () => {
    const retry = begin(ONE_PLY);
    const result = applyMove(retry, "e2", "e5");
    assert.equal(result.accepted, false);
    assert.equal(result.retry, retry);
    assert.equal(applyMove(retry, "e5", "e6").accepted, false);
  });
});

describe("hint", () => {
  it("highlights the from-square and makes a solve incorrect", () => {
    const hinted = hint(begin(ONE_PLY));
    assert.equal(hinted.hintUsed, true);
    assert.equal(hinted.hintSquare, "e2");
    assert.equal(outcomeToRecord(hinted), null, "a hint alone is not decisive");
    const solved = applyMove(hinted, "e2", "e4").retry;
    assert.equal(solved.status, "solved");
    assert.equal(solved.hintSquare, null);
    assert.equal(outcomeToRecord(solved), "incorrect");
  });

  it("hint then reveal records incorrect", () => {
    assert.equal(outcomeToRecord(reveal(hint(begin(ONE_PLY)))), "incorrect");
  });

  it("is a no-op when finished", () => {
    const solved = applyMove(begin(ONE_PLY), "e2", "e4").retry;
    assert.equal(hint(solved), solved);
  });
});

describe("reveal", () => {
  it("shows the end of the line and records incorrect", () => {
    const revealed = reveal(begin(THREE_PLY));
    assert.equal(revealed.status, "revealed");
    assert.equal(revealed.lastMove, "g1f3");
    assert.match(revealed.fen, /^rnbqkbnr\/pppp1ppp\/8\/4p3\/4P3\/5N2\/PPPP1PPP\/RNBQKB1R b/);
    assert.equal(outcomeToRecord(revealed), "incorrect");
  });

  it("locks the board", () => {
    const revealed = reveal(begin(ONE_PLY));
    assert.equal(applyMove(revealed, "e2", "e4").accepted, false);
    assert.equal(reveal(revealed), revealed);
  });
});

describe("3-ply solution", () => {
  it("plays the reply after the first right move, then solves on the last", () => {
    const first = applyMove(begin(THREE_PLY), "e2", "e4");
    assert.equal(first.reply, true);
    assert.equal(first.retry.status, "continuing");
    assert.equal(first.retry.awaitingReply, true);
    assert.equal(outcomeToRecord(first.retry), null, "nothing decisive yet");

    // The solver cannot move while the reply is pending.
    assert.equal(applyMove(first.retry, "d2", "d4").accepted, false);

    const replied = playReply(first.retry);
    assert.equal(replied.awaitingReply, false);
    assert.equal(replied.ply, 2);
    assert.equal(replied.lastMove, "e7e5");
    assert.equal(expectedUci(replied), "g1f3");

    const last = applyMove(replied, "g1", "f3");
    assert.equal(last.retry.status, "solved");
    assert.equal(last.reply, false);
    assert.equal(outcomeToRecord(last.retry), "correct");
  });

  it("a wrong second move records incorrect and keeps the line going", () => {
    const replied = playReply(applyMove(begin(THREE_PLY), "e2", "e4").retry);
    const wrong = applyMove(replied, "b1", "c3");
    assert.equal(wrong.revert, true);
    assert.equal(wrong.retry.fen, replied.fen);
    assert.equal(wrong.retry.ply, 2);
    assert.equal(outcomeToRecord(wrong.retry), "incorrect");
  });

  it("playReply is a no-op without a pending reply", () => {
    const retry = begin(THREE_PLY);
    assert.equal(playReply(retry), retry);
  });
});

describe("alternative mate", () => {
  it("accepts the exact mating move", () => {
    const result = applyMove(begin(MATE_IN_ONE), "h5", "f7");
    assert.equal(result.retry.status, "solved");
  });

  it("accepts any other checkmate when the motif is mate", () => {
    const result = applyMove(begin(ALT_MATE), "b1", "b8");
    assert.equal(result.revert, false);
    assert.equal(result.retry.status, "solved");
    assert.equal(outcomeToRecord(result.retry), "correct");
  });

  it("rejects a non-mating move", () => {
    const result = applyMove(begin(ALT_MATE), "b1", "b7");
    assert.equal(result.revert, true);
  });

  it("does not accept an alternative mate for other motifs", () => {
    const result = applyMove(begin({ ...ALT_MATE, motif: "check" }), "b1", "b8");
    assert.equal(result.revert, true);
  });
});

describe("promotion", () => {
  const PROMO = exercise({
    fen: "8/P6k/8/8/8/8/8/K7 w - - 0 1",
    solutionUci: ["a7a8q"],
    bestPv: ["a7a8q"],
    playedUci: "a1b1",
  });

  it("honours the promotion piece the solver picked", () => {
    assert.equal(applyMove(begin(PROMO), "a7", "a8", "q").retry.status, "solved");
    assert.equal(applyMove(begin(PROMO), "a7", "a8", "n").revert, true);
    assert.equal(applyMove(begin(PROMO), "a7", "a8").retry.status, "solved");
  });
});

describe("exit before moving", () => {
  it("records nothing", () => {
    assert.equal(outcomeToRecord(begin(ONE_PLY)), null);
    assert.equal(outcomeToRecord(hint(begin(ONE_PLY))), null);
  });
});

describe("buildRetryTargets", () => {
  function row(patch: Partial<ReviewRow> & { index: number; side: "w" | "b" }): ReviewRow & { path: number[] } {
    return {
      label: "blunder",
      playedUci: "a2a3",
      bestPv: ["e2e4"],
      lossCp: 300,
      beforePawns: 0.2,
      afterPawns: -2.8,
      forced: false,
      phase: "opening",
      path: Array(patch.index + 1).fill(0),
      ...patch,
    } as unknown as ReviewRow & { path: number[] };
  }

  it("returns both sides in game order and flags the opponent", () => {
    const rows = [
      row({ index: 6, side: "w" }),
      row({ index: 3, side: "b", label: "mistake" }),
      row({ index: 4, side: "w", label: "inaccuracy" }),
      row({ index: 5, side: "w", forced: true }),
      row({ index: 7, side: "b", bestPv: ["a2a3"] }),
    ];
    const fens = Array(8).fill(START);
    const parentPaths = Array.from({ length: 8 }, (_, index) => Array(index).fill(0));
    const targets = buildRetryTargets({ rows, fens, parentPaths, userSide: "w", now: "2026-01-01T00:00:00.000Z" });
    assert.deepEqual(
      targets.map((target) => [target.index, target.exercise.fromOpponent ?? false, target.exercise.label]),
      [
        [3, true, "mistake"],
        [6, false, "blunder"],
      ],
    );
    assert.equal(targets[0].parentPath.length, 3);
    assert.equal(targets[0].momentPath.length, 4);
  });
});
