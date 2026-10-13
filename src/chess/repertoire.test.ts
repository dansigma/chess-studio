import assert from "node:assert/strict";
import test from "node:test";
import { Chess } from "chess.js";
import {
  getDueRepertoireMoves,
  isDue,
  repertoireMoveKey,
  repertoireMoves,
  scheduleReview,
  type SpacedRepetitionItem,
} from "./repertoire.ts";
import {
  createEmptyTree,
  fenKey,
  getFenAt,
  getNodeAt,
  playMove,
  type GameTree,
  type Path,
} from "./tree.ts";

function playSans(sans: string[], tree: GameTree = createEmptyTree(), path: Path = []): { tree: GameTree; path: Path } {
  let state = { tree, path };
  for (const san of sans) {
    const chess = new Chess(getFenAt(state.tree, state.path));
    const move = chess.move(san);
    if (!move) {
      throw new Error(`illegal ${san}`);
    }
    state = playMove(state.tree, state.path, {
      san: move.san,
      uci: `${move.from}${move.to}${move.promotion ?? ""}`,
      fen: chess.fen(),
      from: move.from,
      to: move.to,
    });
  }
  return state;
}

function transposedTree(otherReply: string): { tree: GameTree; path: Path } {
  const main = playSans(["e4", "e5", "Nf3", "Nc6"]);
  const other = playSans(["Nf3", "e5", "e4", otherReply], main.tree, []);
  return { tree: other.tree, path: main.path.slice(0, 3) };
}

test("two move orders into one position list both next moves", () => {
  const { tree, path } = transposedTree("Bc5");
  const moves = repertoireMoves(tree, path);
  assert.deepEqual(moves.map((move) => move.san), ["Nc6", "Bc5"]);
  assert.equal(fenKey(getFenAt(tree, path)), fenKey(getFenAt(tree, [1, 0, 0])));
});

test("the same next move is one row and the click stays on the current line", () => {
  const { tree, path } = transposedTree("Nc6");
  const moves = repertoireMoves(tree, path);
  assert.equal(moves.length, 1);
  assert.equal(moves[0]?.san, "Nc6");
  assert.deepEqual(moves[0]?.path, [...path, 0]);
});

test("a move that exists only on the other order uses that order", () => {
  const main = playSans(["e4", "e5", "Nf3"]);
  const { tree } = playSans(["Nf3", "e5", "e4", "Bc5"], main.tree, []);
  const moves = repertoireMoves(tree, main.path);
  assert.deepEqual(moves.map((move) => move.san), ["Bc5"]);
  assert.deepEqual(moves[0]?.path, [1, 0, 0, 0]);
});

test("a position that differs only by move number still matches", () => {
  const { tree, path } = transposedTree("Nc6");
  const other = getNodeAt(tree, [1, 0, 0]);
  if (!other) {
    throw new Error("missing transposition");
  }
  other.fen = other.fen.replace(/ \d+ \d+$/, " 9 9");
  other.children.push({
    id: "d6",
    san: "d6",
    uci: "d7d6",
    fen: other.fen,
    from: "d7",
    to: "d6",
    children: [],
  });
  const moves = repertoireMoves(tree, path);
  assert.deepEqual(moves.map((move) => move.san), ["Nc6", "d6"]);
  assert.deepEqual(moves[0]?.path, [...path, 0]);
});

test("a different piece placement is excluded", () => {
  const { tree } = transposedTree("Bc5");
  const moves = repertoireMoves(tree, [0]);
  assert.deepEqual(moves.map((move) => move.san), ["e5"]);
});

test("SM-2: initial correct attempt sets interval to 1 day", () => {
  const now = new Date("2026-10-13T12:00:00.000Z");
  const review = scheduleReview(undefined, true, now);
  assert.equal(review.intervalDays, 1);
  assert.equal(review.easeFactor, 2.6);
  assert.equal(review.mistakeCount, 0);
  assert.equal(review.dueDate, "2026-10-14T12:00:00.000Z");
  assert.equal(review.lastReviewedAt, "2026-10-13T12:00:00.000Z");
});

test("SM-2: second correct attempt advances interval to 6 days", () => {
  const t1 = new Date("2026-10-13T12:00:00.000Z");
  const first = scheduleReview(undefined, true, t1);
  const t2 = new Date("2026-10-14T12:00:00.000Z");
  const second = scheduleReview(first, true, t2);
  assert.equal(second.intervalDays, 6);
  assert.equal(second.easeFactor, 2.7);
  assert.equal(second.dueDate, "2026-10-20T12:00:00.000Z");
});

test("SM-2: third correct attempt multiplies interval by ease factor", () => {
  const second: SpacedRepetitionItem = {
    intervalDays: 6,
    easeFactor: 2.5,
    mistakeCount: 0,
    lastReviewedAt: "2026-10-14T12:00:00.000Z",
    dueDate: "2026-10-20T12:00:00.000Z",
  };
  const t3 = new Date("2026-10-20T12:00:00.000Z");
  const third = scheduleReview(second, true, t3);
  assert.equal(third.intervalDays, 15); // Math.round(6 * 2.5)
  assert.equal(third.easeFactor, 2.6);
  assert.equal(third.dueDate, "2026-11-04T12:00:00.000Z");
});

test("SM-2: mistake resets interval to 1 day and reduces ease factor to min 1.3", () => {
  const current: SpacedRepetitionItem = {
    intervalDays: 15,
    easeFactor: 1.4,
    mistakeCount: 1,
    lastReviewedAt: "2026-10-13T12:00:00.000Z",
    dueDate: "2026-10-28T12:00:00.000Z",
  };
  const now = new Date("2026-10-28T12:00:00.000Z");
  const next = scheduleReview(current, false, now);
  assert.equal(next.intervalDays, 1);
  assert.equal(next.mistakeCount, 2);
  assert.equal(next.easeFactor, 1.3); // Clamped at 1.3
  assert.equal(next.dueDate, "2026-10-29T12:00:00.000Z");
});

test("isDue returns true for undefined items or past due dates", () => {
  const now = new Date("2026-10-13T12:00:00.000Z");
  assert.equal(isDue(undefined, now), true);
  assert.equal(
    isDue(
      {
        intervalDays: 1,
        easeFactor: 2.5,
        mistakeCount: 0,
        lastReviewedAt: "2026-10-12T12:00:00.000Z",
        dueDate: "2026-10-13T12:00:00.000Z",
      },
      now,
    ),
    true,
  );
  assert.equal(
    isDue(
      {
        intervalDays: 1,
        easeFactor: 2.5,
        mistakeCount: 0,
        lastReviewedAt: "2026-10-13T12:00:00.000Z",
        dueDate: "2026-10-14T12:00:00.000Z",
      },
      now,
    ),
    false,
  );
});

test("transpositions produce identical keys and share progress", () => {
  const { tree, path } = transposedTree("Bc5");
  const fen1 = getFenAt(tree, path);
  const fen2 = getFenAt(tree, [1, 0, 0]);
  const key1 = repertoireMoveKey(fen1, "f8c5");
  const key2 = repertoireMoveKey(fen2, "f8c5");
  assert.equal(key1, key2);
});

test("getDueRepertoireMoves collects unreviewed and due moves in tree without duplicates", () => {
  const { tree } = transposedTree("Bc5");
  const now = new Date("2026-10-13T12:00:00.000Z");
  const due = getDueRepertoireMoves(tree, {}, now);
  // All moves in the tree are unreviewed, so each unique (fenKey, uci) is listed once
  const keys = due.map((d) => d.key);
  const uniqueKeys = new Set(keys);
  assert.equal(keys.length, uniqueKeys.size);
  assert.ok(due.length > 0);
});

