// SIG-968: unit tests for the pure review-annotation builder.
import assert from "node:assert/strict";
import test from "node:test";
import {
  buildReviewAnnotations,
  REVIEW_ANNOTATION_SENTINEL,
  type ReviewAnnotationOptions,
  type ReviewAnnotationRow,
} from "./review-annotate.ts";
import { START_FEN } from "./tree.ts";

const E2E4_FEN = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";

function row(overrides: Partial<ReviewAnnotationRow> = {}): ReviewAnnotationRow {
  return {
    path: [0],
    label: "mistake",
    afterPawns: 0.5,
    bestPv: ["d2d4"],
    playedUci: "e2e4",
    fenBefore: START_FEN,
    ...overrides,
  };
}

const ALL_ON: ReviewAnnotationOptions = { evals: true, bestMove: true, keyMomentsOnly: false };

test("NAG mapping covers every tier and miss writes comment only", () => {
  const cases: Array<[ReviewAnnotationRow["label"], number[] | undefined]> = [
    ["brilliant", [3]],
    ["great", [1]],
    ["inaccuracy", [6]],
    ["mistake", [2]],
    ["blunder", [4]],
    ["miss", undefined],
    ["best", undefined],
    ["veryGood", undefined],
    ["decent", undefined],
    ["book", undefined],
    ["forced", undefined],
    [null, undefined],
  ];
  for (const [label, expected] of cases) {
    // bestPv matches the played move so no best-was line interferes with the NAG assertion.
    const edits = buildReviewAnnotations("en", [row({ label, playedUci: "d2d4", bestPv: ["d2d4"] })], ALL_ON);
    assert.equal(edits.length, 1, `label ${label} should produce one edit`);
    assert.deepEqual(edits[0]?.nags, expected, `NAG for label ${label}`);
  }
});

test("review NAG replaces only the move group and preserves position NAGs", () => {
  const edits = buildReviewAnnotations(
    "en",
    [row({ label: "blunder", nags: [10, 2], playedUci: "d2d4", bestPv: ["d2d4"] })],
    ALL_ON,
  );
  assert.deepEqual(edits[0]?.nags, [4, 10]);
});

test("eval tag keeps White POV for a black move", () => {
  const edits = buildReviewAnnotations(
    "en",
    [row({ label: "decent", afterPawns: -1.234, playedUci: "d2d4", bestPv: ["d2d4"] })],
    ALL_ON,
  );
  assert.ok(edits[0]?.comment?.includes("[%eval -1.23]"), `got: ${edits[0]?.comment}`);
});

test("mate scores clamp to the chart cap and render numerically", () => {
  const plus = buildReviewAnnotations("en", [row({ afterPawns: 900 })], ALL_ON);
  assert.ok(plus[0]?.comment?.includes("[%eval 5.00]"), `got: ${plus[0]?.comment}`);
  const minus = buildReviewAnnotations("en", [row({ afterPawns: -1200 })], ALL_ON);
  assert.ok(minus[0]?.comment?.includes("[%eval -5.00]"), `got: ${minus[0]?.comment}`);
});

test("best-was note appears only for miss/mistake/blunder with a known better move", () => {
  for (const label of ["miss", "mistake", "blunder"] as const) {
    const edits = buildReviewAnnotations("en", [row({ label })], ALL_ON);
    assert.ok(edits[0]?.comment?.includes("Best was d4."), `${label} got: ${edits[0]?.comment}`);
  }
  const great = buildReviewAnnotations("en", [row({ label: "great" })], ALL_ON);
  assert.ok(!great[0]?.comment?.includes("Best was"), `great got: ${great[0]?.comment}`);
  const playedBest = buildReviewAnnotations("en", [row({ label: "mistake", playedUci: "d2d4" })], ALL_ON);
  assert.ok(!playedBest[0]?.comment?.includes("Best was"), `played-best got: ${playedBest[0]?.comment}`);
  const emptyPv = buildReviewAnnotations("en", [row({ label: "miss", bestPv: [] })], ALL_ON);
  assert.ok(!emptyPv[0]?.comment?.includes("Best was"), `empty-pv got: ${emptyPv[0]?.comment}`);
});

test("best-was note is localized through the whole-sentence template", () => {
  const edits = buildReviewAnnotations("pt-br", [row({ label: "miss" })], ALL_ON);
  assert.ok(edits[0]?.comment?.includes("Melhor era d4."), `got: ${edits[0]?.comment}`);
});

test("re-annotate is a no-op: strips the prior block and preserves user text", () => {
  const first = buildReviewAnnotations("en", [row({ label: "mistake" })], ALL_ON);
  assert.equal(first.length, 1);
  const applied = row({
    label: "mistake",
    nags: first[0]?.nags,
    comment: `My note\n\n${first[0]?.comment}`,
  });
  const second = buildReviewAnnotations("en", [applied], ALL_ON);
  assert.deepEqual(second, [], "identical re-annotate must emit no edits");
  assert.ok(applied.comment?.startsWith("My note"), "user text survives");
  assert.equal(applied.comment?.split(REVIEW_ANNOTATION_SENTINEL).length, 2);
});

test("keyMomentsOnly restricts edits to key-moment labels", () => {
  const options: ReviewAnnotationOptions = { ...ALL_ON, keyMomentsOnly: true };
  const edits = buildReviewAnnotations(
    "en",
    [row({ path: [0], label: "decent" }), row({ path: [1], label: "brilliant", fenBefore: E2E4_FEN })],
    options,
  );
  assert.equal(edits.length, 1);
  assert.deepEqual(edits[0]?.path, [1]);
});

test("evals and bestMove options toggle their lines", () => {
  const noEvals = buildReviewAnnotations("en", [row({ label: "mistake" })], {
    ...ALL_ON,
    evals: false,
  });
  assert.ok(!noEvals[0]?.comment?.includes("[%eval"), `got: ${noEvals[0]?.comment}`);
  assert.ok(noEvals[0]?.comment?.includes("Best was"), `got: ${noEvals[0]?.comment}`);
  const noBest = buildReviewAnnotations("en", [row({ label: "mistake" })], {
    ...ALL_ON,
    bestMove: false,
  });
  assert.ok(noBest[0]?.comment?.includes("[%eval"), `got: ${noBest[0]?.comment}`);
  assert.ok(!noBest[0]?.comment?.includes("Best was"), `got: ${noBest[0]?.comment}`);
});
