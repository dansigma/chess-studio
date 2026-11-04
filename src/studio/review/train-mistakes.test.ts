// SIG-1206: banner model — fresh vs cached counting and string/plural choice.
import assert from "node:assert/strict";
import test from "node:test";
import { Chess } from "chess.js";
import type { MistakeExercise } from "../../chess/mistake-exercises.ts";
import { fenKey } from "../../chess/tree.ts";
import {
  MISTAKES_TRAINER_HREF,
  dueGameExerciseCount,
  trainBannerFor,
  trainBannerText,
} from "./train-mistakes.ts";

function fensOf(moves: string[]): string[] {
  const chess = new Chess();
  const fens = [chess.fen()];
  for (const san of moves) {
    chess.move(san);
    fens.push(chess.fen());
  }
  return fens;
}

function exerciseAt(fen: string): MistakeExercise {
  return {
    key: `mx:${fenKey(fen)}`,
    fen,
    solutionUci: ["e2e4"],
    bestPv: ["e2e4"],
    playedUci: "d2d4",
    label: "mistake",
    phase: "opening",
    lossCp: 200,
    beforePawns: 0.2,
    afterPawns: -1.8,
    motif: "positional",
    createdAt: "2026-11-01T00:00:00.000Z",
  };
}

const FENS = fensOf(["e4", "e5", "Nf3", "Nc6"]);

test("trainer href is the My mistakes puzzle mode", () => {
  assert.equal(MISTAKES_TRAINER_HREF, "/puzzles/play?mode=mistakes");
});

test("fresh run: banner only when at least one exercise was added", () => {
  const base = { fresh: true, userSide: "w" as const, fens: FENS, due: [] };
  assert.deepEqual(trainBannerFor({ ...base, capture: { added: 2, side: "w" } }), { count: 2, side: "w" });
  assert.equal(trainBannerFor({ ...base, capture: { added: 0, side: "w" } }), null);
  assert.equal(trainBannerFor({ ...base, capture: null }), null);
});

test("cached: counts this game's due exercises for the reviewed side only", () => {
  const whiteMistake = exerciseAt(FENS[2]); // white to move
  const blackMistake = exerciseAt(FENS[1]); // black to move
  const otherGame = exerciseAt(fensOf(["d4"])[1]);
  const due = [whiteMistake, blackMistake, otherGame];
  assert.equal(dueGameExerciseCount(due, FENS, "w"), 1);
  assert.equal(dueGameExerciseCount(due, FENS, "b"), 1);
  assert.deepEqual(
    trainBannerFor({ fresh: false, capture: null, userSide: "w", fens: FENS, due }),
    { count: 1, side: "w" },
  );
  assert.equal(trainBannerFor({ fresh: false, capture: null, userSide: "w", fens: FENS, due: [otherGame] }), null);
  assert.equal(trainBannerFor({ fresh: false, capture: null, userSide: "w", fens: FENS, due: [] }), null);
});

test("banner text picks singular/plural and side in both locales", () => {
  assert.equal(trainBannerText("en", { count: 2, side: "w" }), "2 of White's mistakes became exercises");
  assert.equal(trainBannerText("en", { count: 1, side: "b" }), "1 of Black's mistakes became an exercise");
  assert.equal(trainBannerText("pt-br", { count: 2, side: "w" }), "2 dos erros das Brancas viraram exercícios");
  assert.equal(trainBannerText("pt-br", { count: 1, side: "b" }), "1 dos erros das Pretas virou exercício");
});
