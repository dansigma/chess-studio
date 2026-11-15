// SIG-1373: the lesson session reducer (Aprender flow, mistakes, summary).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MARK_HEX } from "../../chess/marks.ts";
import type { LessonFrame } from "../lesson.ts";
import {
  INITIAL_LESSON_SESSION,
  autoAdvance,
  guideArrows,
  guideComment,
  hintArrows,
  hintSquares,
  lessonOpenStep,
  lessonSessionReducer,
  lessonSummary,
  lessonWaiting,
  type LessonSession,
  type LessonSessionAction,
} from "./session.ts";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function frame(student: boolean, comment = ""): LessonFrame {
  return {
    fen: START,
    comment,
    san: "e4",
    move: { uci: "e2e4", san: "e4", from: "e2", to: "e4", student },
  };
}

function run(actions: LessonSessionAction[]): LessonSession {
  return actions.reduce(lessonSessionReducer, INITIAL_LESSON_SESSION);
}

describe("lesson session", () => {
  it("opens in Aprender at the saved step and ends in the summary", () => {
    const state = run([{ type: "open", mode: "learn", step: 2, lastStep: 5 }]);
    assert.equal(state.mode, "learn");
    assert.equal(state.reachedStep, 2);
    assert.equal(state.viewStep, 2);
    assert.equal(state.phase, "playing");
    assert.equal(state.mistakes, 0);
    assert.deepEqual(
      guideArrows(state, frame(true)).map((arrow) => [
        arrow.startSquare,
        arrow.endSquare,
        arrow.color,
      ]),
      [["e2", "e4", MARK_HEX.B]],
    );

    const ended = run([{ type: "open", mode: "learn", step: 5, lastStep: 5 }]);
    assert.equal(ended.phase, "summary");
  });

  it("opens Treinar from the start and Aprender at the saved step", () => {
    const learned = { step: 7, learned: true };
    assert.equal(lessonOpenStep("train", learned, 7), 0);
    assert.equal(lessonOpenStep("learn", learned, 7), 7);
    assert.equal(lessonOpenStep("learn", { step: 3, learned: false }, 7), 3);
    assert.equal(lessonOpenStep("learn", { step: 12, learned: false }, 7), 7);
    assert.equal(lessonOpenStep("learn", { step: -2, learned: false }, 7), 0);
    assert.equal(lessonOpenStep("learn", undefined, 7), 0);
  });

  it("advances one frame at a time and stops on the summary", () => {
    let state = run([{ type: "open", mode: "learn", step: 0, lastStep: 2 }]);
    state = lessonSessionReducer(state, { type: "advance", lastStep: 2 });
    assert.equal(state.viewStep, 1);
    assert.equal(state.phase, "playing");
    state = lessonSessionReducer(state, { type: "advance", lastStep: 2 });
    assert.equal(state.viewStep, 2);
    assert.equal(state.phase, "summary");
    state = lessonSessionReducer(state, { type: "advance", lastStep: 2 });
    assert.equal(state.viewStep, 2);
  });

  it("counts a wrong move without moving the board", () => {
    const state = run([
      { type: "open", mode: "learn", step: 1, lastStep: 4 },
      { type: "wrong" },
      { type: "wrong" },
    ]);
    assert.equal(state.mistakes, 2);
    assert.equal(state.viewStep, 1);
    assert.equal(state.reachedStep, 1);
    assert.equal(state.phase, "playing");
  });

  it("summarizes moves played, mistakes and the last comment", () => {
    const frames = [frame(false), frame(true), frame(true, "Last comment")];
    let state = run([
      { type: "open", mode: "learn", step: 0, lastStep: 2 },
      { type: "wrong" },
      { type: "advance", lastStep: 2 },
      { type: "advance", lastStep: 2 },
    ]);
    assert.deepEqual(lessonSummary(state, frames), {
      moves: 2,
      mistakes: 1,
      hints: 0,
      comment: "Last comment",
    });
    state = { ...state, phase: "playing" };
    assert.equal(lessonSummary(state, frames), null);
  });

  it("Refazer restarts Aprender from the first move", () => {
    const state = run([
      { type: "open", mode: "learn", step: 0, lastStep: 2 },
      { type: "wrong" },
      { type: "advance", lastStep: 2 },
      { type: "advance", lastStep: 2 },
      { type: "start", mode: "learn", lastStep: 2 },
    ]);
    assert.deepEqual(state, {
      mode: "learn",
      reachedStep: 0,
      viewStep: 0,
      mistakes: 0,
      hintsUsed: 0,
      hintLevel: 0,
      phase: "playing",
    });
  });

  it("Continuar para Revisão restarts the line in Treinar", () => {
    const state = run([
      { type: "open", mode: "learn", step: 2, lastStep: 2 },
      { type: "start", mode: "train", lastStep: 2 },
    ]);
    assert.equal(state.mode, "train");
    assert.equal(state.reachedStep, 0);
    assert.equal(state.viewStep, 0);
    assert.equal(state.phase, "playing");
    assert.deepEqual(guideArrows(state, frame(true)), []);
  });

  it("shows the guide arrow only while the student is waiting", () => {
    const waiting = run([{ type: "open", mode: "learn", step: 0, lastStep: 3 }]);
    assert.equal(lessonWaiting(waiting, frame(true)), true);
    assert.equal(guideArrows(waiting, frame(true)).length, 1);
    assert.deepEqual(guideArrows(waiting, frame(false)), []);

    const browsing = lessonSessionReducer(
      lessonSessionReducer(waiting, { type: "advance", lastStep: 3 }),
      { type: "view", step: 0, lastStep: 3 },
    );
    assert.equal(lessonWaiting(browsing, frame(true)), false);
    assert.deepEqual(guideArrows(browsing, frame(true)), []);

    const training = lessonSessionReducer(waiting, {
      type: "start",
      mode: "train",
      lastStep: 3,
    });
    assert.deepEqual(guideArrows(training, frame(true)), []);

    const finished = run([{ type: "open", mode: "learn", step: 3, lastStep: 3 }]);
    assert.deepEqual(guideArrows(finished, frame(true)), []);
  });

  it("auto-plays opponent frames at the frontier in both modes", () => {
    const frontier = run([{ type: "open", mode: "learn", step: 1, lastStep: 3 }]);
    assert.equal(autoAdvance(frontier, frame(false)), true);
    assert.equal(autoAdvance(frontier, frame(true)), false);

    const browsing = lessonSessionReducer(frontier, {
      type: "view",
      step: 0,
      lastStep: 3,
    });
    assert.equal(autoAdvance(browsing, frame(false)), false);

    const training = lessonSessionReducer(frontier, {
      type: "start",
      mode: "train",
      lastStep: 3,
    });
    assert.equal(autoAdvance(training, frame(false)), true);
    assert.equal(autoAdvance(training, frame(true)), false);
  });

  it("Treinar hint ladder lights the piece, then the arrow, and counts", () => {
    let state = run([{ type: "start", mode: "train", lastStep: 3 }]);
    const target = frame(true);
    assert.deepEqual(hintSquares(state, target), []);
    assert.deepEqual(hintArrows(state, target), []);

    state = lessonSessionReducer(state, { type: "hint" });
    assert.equal(state.hintLevel, 1);
    assert.equal(state.hintsUsed, 1);
    assert.deepEqual(hintSquares(state, target), ["e2"]);
    assert.deepEqual(hintArrows(state, target), []);

    state = lessonSessionReducer(state, { type: "hint" });
    assert.equal(state.hintLevel, 2);
    assert.equal(state.hintsUsed, 2);
    assert.deepEqual(hintSquares(state, target), ["e2"]);
    assert.deepEqual(
      hintArrows(state, target).map((arrow) => [
        arrow.startSquare,
        arrow.endSquare,
        arrow.color,
      ]),
      [["e2", "e4", MARK_HEX.B]],
    );

    // A third press has nothing left to reveal and is not counted.
    state = lessonSessionReducer(state, { type: "hint" });
    assert.equal(state.hintLevel, 2);
    assert.equal(state.hintsUsed, 2);

    // The ladder resets on the student's next move.
    state = lessonSessionReducer(state, { type: "advance", lastStep: 3 });
    assert.equal(state.hintLevel, 0);
    assert.deepEqual(hintSquares(state, target), []);
  });

  it("Treinar has no hints in Aprender, away from the frontier or on the summary", () => {
    const learning = run([{ type: "start", mode: "learn", lastStep: 3 }]);
    assert.deepEqual(
      lessonSessionReducer(learning, { type: "hint" }),
      learning,
    );

    const training = run([{ type: "start", mode: "train", lastStep: 1 }]);
    const browsing = lessonSessionReducer(training, {
      type: "view",
      step: 0,
      lastStep: 1,
    });
    assert.deepEqual(hintSquares(browsing, frame(true)), []);
    assert.deepEqual(hintArrows(browsing, frame(true)), []);

    const summary = run([
      { type: "start", mode: "train", lastStep: 0 },
    ]);
    assert.equal(summary.phase, "summary");
    assert.deepEqual(hintSquares(summary, frame(true)), []);
  });

  it("counts wrong Treinar moves without moving and keeps the hint", () => {
    let state = run([
      { type: "start", mode: "train", lastStep: 3 },
      { type: "hint" },
    ]);
    state = lessonSessionReducer(state, { type: "wrong" });
    state = lessonSessionReducer(state, { type: "wrong" });
    assert.equal(state.mistakes, 2);
    assert.equal(state.reachedStep, 0);
    assert.equal(state.viewStep, 0);
    assert.equal(state.phase, "playing");
    // Same target move: the highlight the student already paid for stays.
    assert.equal(state.hintLevel, 1);
    assert.equal(state.hintsUsed, 1);
  });

  it("shows the author's comment of the move about to be played", () => {
    const frames = [frame(true, "Opening"), frame(false, "Clear the d-pawn")];
    assert.equal(guideComment(frames, 0), "Clear the d-pawn");
    assert.equal(guideComment(frames, 1), "");
  });

  it("browsing never goes past the reached frame or before the start", () => {
    const state = run([
      { type: "open", mode: "learn", step: 1, lastStep: 3 },
      { type: "view", step: 9, lastStep: 3 },
    ]);
    assert.equal(state.viewStep, 1);
    const start = lessonSessionReducer(state, { type: "view", step: -4, lastStep: 3 });
    assert.equal(start.viewStep, 0);
  });
});
