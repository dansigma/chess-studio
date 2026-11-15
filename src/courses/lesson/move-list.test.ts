import assert from "node:assert/strict";
import { test } from "node:test";
import { clampViewStep, moveListModel } from "./move-list.ts";
import type { LessonFrame } from "../lesson.ts";

const W = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const B = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
const W2 = "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2";

function frame(fen: string, comment: string, san: string | null, student = false): LessonFrame {
  return {
    fen,
    comment,
    san,
    move: { uci: "x", san: "?", from: "a1", to: "a2", student },
  };
}

const frames: LessonFrame[] = [
  frame(W, "Open [%cal Ge2e4] it", null),
  frame(B, "Center [%csl Re4]", "e4", true),
  frame(W2, "", "e5"),
  { fen: W2, comment: "", san: "Nf3", move: null },
];

test("numbers both colors, strips tokens, hides future moves", () => {
  const model = moveListModel(frames, 1, 1);
  assert.equal(model.opening, "Open it");
  assert.deepEqual(
    model.entries.map((e) => [e.label, e.san, e.comment, e.current]),
    [["1.", "e4", "Center", true]],
  );
  assert.deepEqual(model.pending, { label: "1…", color: "b" });
  assert.equal(JSON.stringify(model).includes("e5"), false);
});

test("black number follows commented white move; pending only when student", () => {
  const model = moveListModel(frames, 2, 2);
  assert.equal(model.entries[1].label, "1…");
  assert.equal(model.entries[1].showNumber, true);
  assert.equal(model.pending, null);
  const quiet = moveListModel(
    [frames[0], { ...frames[1], comment: "" }, frames[2], frames[3]],
    2,
    2,
  );
  assert.equal(quiet.entries[1].showNumber, false);
});

test("a line starting with Black numbers from the start FEN", () => {
  const startBlack: LessonFrame[] = [
    frame(B, "", null),
    frame(W2, "", "e5"),
    { fen: W2, comment: "", san: "Nf3", move: null },
  ];
  const model = moveListModel(startBlack, 2, 2);
  assert.deepEqual(
    model.entries.map((e) => [e.label, e.showNumber]),
    [
      ["1…", true],
      ["2.", true],
    ],
  );
});

test("clampViewStep never goes past the reached step", () => {
  assert.equal(clampViewStep(5, 2), 2);
  assert.equal(clampViewStep(-1, 2), 0);
  assert.equal(clampViewStep(1, 2), 1);
});
