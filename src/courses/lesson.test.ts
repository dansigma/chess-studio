import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { importPgn } from "../chess/pgn.ts";
import { lessonFrames, lineProgressLabel, moveMatches, progressAfterStep, studentMoveMatches } from "./lesson.ts";
import { SEED_COURSES } from "./seed.ts";

describe("course lessons", () => {
  it("asks the student to play the black moves of the Caro-Kann", () => {
    const variation = SEED_COURSES[0]?.chapters[0]?.variations[0];
    assert.ok(variation);
    const imported = importPgn(variation.pgn);
    const frames = lessonFrames(imported.tree, "black");
    assert.equal(frames[0]?.move?.san, "e4");
    assert.equal(frames[0]?.move?.student, false);
    const student = frames.find((frame) => frame.move?.student);
    assert.equal(student?.move?.san, "c6");
    assert.equal(moveMatches(student!, student!.move!.uci), true);
    assert.equal(moveMatches(student!, "d7d5"), false);
    assert.match(frames[0]?.comment ?? "", /Caro-Kann/);
    const studentFrame = frames.find((frame) => frame.move?.student);
    assert.equal(studentFrame?.comment.includes("c6"), false);
  });

  it("labels a line as new, in progress, or learned", () => {
    assert.equal(lineProgressLabel(undefined, 8), "Not started");
    assert.equal(lineProgressLabel({ step: 0, learned: false }, 8), "Not started");
    assert.equal(lineProgressLabel({ step: 2, learned: false }, 8), "Continue · 3 / 8");
    assert.equal(lineProgressLabel({ step: 4, learned: true }, 8), "Learned");
  });

  it("marks a line learned only by stepping onto the last frame", () => {
    assert.deepEqual(progressAfterStep(undefined, 6, 7, 8), { step: 7, learned: true });
    assert.deepEqual(progressAfterStep(undefined, 0, 7, 8), { step: 7, learned: false });
    assert.deepEqual(progressAfterStep({ step: 7, learned: true }, 7, 4, 8), { step: 4, learned: true });
    assert.deepEqual(progressAfterStep(undefined, 2, 1, 8), { step: 1, learned: false });
  });

  it("accepts an underpromotion that matches the line", () => {
    const imported = importPgn(`[Event "Test"]

1. b4 h5 2. b5 h4 3. b6 h3 4. bxa7 hxg2 5. axb8=N`);
    const frames = lessonFrames(imported.tree, "white");
    const promote = frames.find((frame) => frame.move?.uci === "a7b8n");
    assert.ok(promote);
    assert.equal(promote.move?.student, true);
    assert.equal(studentMoveMatches(promote, "a7", "b8"), true);
    assert.equal(moveMatches(promote, "a7b8q"), false);
    assert.equal(studentMoveMatches(promote, "e2", "e4"), false);
  });
});
