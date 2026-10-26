// SIG-1094: tests for the pure repertoire-deviation actions. Fixtures reuse
// the `playSans` grain from repertoire.test.ts so trees carry real FENs.
import assert from "node:assert/strict";
import test from "node:test";
import { Chess } from "chess.js";
import { addOpponentMove, findPathToPosition, withMoveDue } from "./repertoire-actions.ts";
import { isDue, repertoireMoveKey, type SpacedRepetitionItem } from "./repertoire.ts";
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

test("findPathToPosition returns the root path for the start position", () => {
  const { tree } = playSans(["e4", "e5"]);
  assert.deepEqual(findPathToPosition(tree, tree.startFen), []);
});

test("findPathToPosition resolves a transposed position to a matching path", () => {
  const { tree, path } = transposedTree("Bc5");
  const target = getFenAt(tree, path);
  const found = findPathToPosition(tree, target);
  assert.ok(found, "transposed position must resolve");
  assert.equal(fenKey(getFenAt(tree, found)), fenKey(target));
});

test("findPathToPosition returns null for a position absent from the tree", () => {
  const { tree } = playSans(["e4", "e5"]);
  const other = playSans(["d4", "d5"]);
  assert.equal(findPathToPosition(tree, getFenAt(other.tree, other.path)), null);
});

test("findPathToPosition matches regardless of move counters", () => {
  const { tree, path } = transposedTree("Nc6");
  const shifted = getFenAt(tree, path).replace(/ \d+ \d+$/, " 9 9");
  const found = findPathToPosition(tree, shifted);
  assert.ok(found, "counter-shifted position must resolve");
  assert.equal(fenKey(getFenAt(tree, found)), fenKey(shifted));
});

test("withMoveDue sets dueDate to now and preserves interval and ease", () => {
  const { tree } = playSans(["e4", "e5"]);
  const fen = getFenAt(tree, []);
  const key = repertoireMoveKey(fen, "e7e5");
  const existing: SpacedRepetitionItem = {
    lastReviewedAt: "2026-10-13T12:00:00.000Z",
    intervalDays: 6,
    easeFactor: 2.6,
    dueDate: "2026-11-01T12:00:00.000Z",
    mistakeCount: 1,
  };
  const now = new Date("2026-10-20T12:00:00.000Z");
  const next = withMoveDue({ [key]: existing }, fen, "e7e5", now);
  assert.equal(next[key]?.dueDate, now.toISOString());
  assert.equal(next[key]?.intervalDays, 6);
  assert.equal(next[key]?.easeFactor, 2.6);
  assert.equal(next[key]?.mistakeCount, 1);
  assert.ok(isDue(next[key], now));
  // Input untouched.
  assert.equal(existing.dueDate, "2026-11-01T12:00:00.000Z");
});

test("withMoveDue synthesizes a due zero-history item when missing", () => {
  const { tree } = playSans(["e4"]);
  const fen = getFenAt(tree, []);
  const now = new Date("2026-10-20T12:00:00.000Z");
  const next = withMoveDue({}, fen, "e2e4", now);
  const key = repertoireMoveKey(fen, "e2e4");
  assert.equal(next[key]?.dueDate, now.toISOString());
  assert.equal(next[key]?.intervalDays, 0);
  assert.ok(isDue(next[key], now));
});

test("addOpponentMove appends the gap move and returns its path", () => {
  const { tree, path } = playSans(["e4", "e5", "Nf3"]);
  const fen = getFenAt(tree, path);
  const chess = new Chess(fen);
  const move = chess.move("Nc6");
  const result = addOpponentMove(tree, fen, {
    san: move.san,
    uci: `${move.from}${move.to}${move.promotion ?? ""}`,
    fen: chess.fen(),
    from: move.from,
    to: move.to,
  });
  assert.ok(result, "gap move must be added");
  const node = getNodeAt(result.tree, result.path);
  assert.equal(node?.san, "Nc6");
  // Original tree untouched.
  assert.equal(getNodeAt(tree, result.path), null);
});

test("addOpponentMove is idempotent for the same UCI", () => {
  const { tree, path } = playSans(["e4", "e5", "Nf3"]);
  const fen = getFenAt(tree, path);
  const chess = new Chess(fen);
  const move = chess.move("Nc6");
  const record = {
    san: move.san,
    uci: `${move.from}${move.to}${move.promotion ?? ""}`,
    fen: chess.fen(),
    from: move.from,
    to: move.to,
  };
  const first = addOpponentMove(tree, fen, record);
  assert.ok(first);
  const second = addOpponentMove(first.tree, fen, record);
  assert.ok(second);
  assert.deepEqual(second.path, first.path);
  const parent = getNodeAt(second.tree, first.path.slice(0, -1));
  assert.equal(parent?.children.filter((child) => child.uci === record.uci).length, 1);
});

test("addOpponentMove returns null when the position is absent", () => {
  const { tree } = playSans(["e4", "e5"]);
  const other = playSans(["d4"]);
  const missing = getFenAt(other.tree, other.path);
  const chess = new Chess(missing);
  const move = chess.move("d5");
  assert.equal(
    addOpponentMove(tree, missing, {
      san: move.san,
      uci: `${move.from}${move.to}${move.promotion ?? ""}`,
      fen: chess.fen(),
      from: move.from,
      to: move.to,
    }),
    null,
  );
});
