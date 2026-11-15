// SIG-1371: the move list only reports the viewed step and hides unreached moves.
import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";
import { setupDom, teardownDom } from "../../test-utils/dom.ts";
import { cleanup, fireEvent, render } from "@testing-library/react";
import type { LessonFrame } from "../lesson.ts";

before(() => setupDom());
after(() => teardownDom());
afterEach(() => cleanup());

const { LessonMoveList } = await import("./LessonMoveList.tsx");

const W = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const B = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
const W2 = "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2";
const mv = (student: boolean) => ({ uci: "x", san: "?", from: "a1", to: "a2", student });

const frames: LessonFrame[] = [
  { fen: W, comment: "Start [%cal Ge2e4]", san: null, move: mv(false) },
  { fen: B, comment: "Center", san: "e4", move: mv(true) },
  { fen: W2, comment: "", san: "e5", move: mv(false) },
  { fen: W2, comment: "", san: "Nf3", move: null },
];

test("Treinar hides every author comment and keeps only the moves", () => {
  const { getByText, queryByText } = render(
    <LessonMoveList
      locale="pt-br"
      frames={frames}
      reachedStep={2}
      viewStep={2}
      showComments={false}
      onSelect={() => {}}
    />,
  );
  getByText("e4");
  getByText("e5");
  assert.equal(queryByText("Start"), null);
  assert.equal(queryByText("Center"), null);
});

test("lists reached moves with comments, hides the rest, marks Sua vez", () => {
  const selected: number[] = [];
  const { container, queryByText, getByText } = render(
    <LessonMoveList
      locale="pt-br"
      frames={frames}
      reachedStep={1}
      viewStep={1}
      onSelect={(step) => selected.push(step)}
    />,
  );
  assert.ok(queryByText("Start"));
  assert.ok(queryByText("Center"));
  assert.equal(queryByText("e5"), null);
  assert.ok(getByText("Sua vez"));
  fireEvent.click(getByText("e4"));
  assert.deepEqual(selected, [1]);
  assert.equal(
    container.querySelector('[aria-current="step"]')?.textContent,
    "e4",
  );
});
