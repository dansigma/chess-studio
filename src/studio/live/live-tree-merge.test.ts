import assert from "node:assert/strict";
import test from "node:test";
import { importPgn } from "@/src/chess/pgn.ts";
import { getNodeAt, playMove } from "@/src/chess/tree.ts";
import { Chess } from "chess.js";
import { mergeLiveMainline } from "./live-tree-merge.ts";

function uciMove(fen: string, san: string) {
  const chess = new Chess(fen);
  const move = chess.move(san);
  return {
    san: move.san,
    uci: `${move.from}${move.to}${move.promotion ?? ""}`,
    fen: chess.fen(),
    from: move.from,
    to: move.to,
  };
}

test("mergeLiveMainline appends new mainline plies while preserving user side variations and annotations", () => {
  const base = importPgn("1. e4 e5").tree;
  // User adds a comment on 1...e5 and a side variation 1...c5 2. Nf3.
  base.children[0]!.children[0]!.comment = "Solid";
  base.children[0]!.children[0]!.nags = [1];
  const e4Fen = base.children[0]!.fen;
  const c5 = uciMove(e4Fen, "c5");
  const withC5 = playMove(base, [0], c5);
  const withNf3 = playMove(withC5.tree, withC5.path, uciMove(c5.fen, "Nf3"));

  const incoming = importPgn("1. e4 e5 2. Nf3 Nc6 3. Bb5").tree;
  const merged = mergeLiveMainline(withNf3.tree, incoming, [0, 1]);

  assert.equal(merged.diverged, false);
  assert.equal(merged.addedMoves, 3);
  // Existing 1...e5 annotation and 1...c5 variation are intact.
  assert.equal(merged.tree.children[0]!.children[0]!.comment, "Solid");
  assert.deepEqual(merged.tree.children[0]!.children[0]!.nags, [1]);
  assert.equal(merged.tree.children[0]!.children[1]!.san, "c5");
  assert.equal(merged.tree.children[0]!.children[1]!.children[0]!.san, "Nf3");
  // New mainline moves are appended after 1...e5.
  assert.equal(merged.tree.children[0]!.children[0]!.children[0]!.san, "Nf3");
  assert.equal(merged.tree.children[0]!.children[0]!.children[0]!.children[0]!.san, "Nc6");
  assert.equal(merged.tree.children[0]!.children[0]!.children[0]!.children[0]!.children[0]!.san, "Bb5");
  // Cursor on 1...c5 stays on 1...c5.
  assert.deepEqual(merged.path, [0, 1]);
  assert.equal(getNodeAt(merged.tree, merged.path)?.san, "c5");
});

test("mergeLiveMainline keeps user speculative move at the tip as a side variation and relocates cursor", () => {
  const base = importPgn("1. e4 e5").tree;
  // User analyzes 2. Bc4 ahead of the live broadcast tip.
  const e5Fen = base.children[0]!.children[0]!.fen;
  const withBc4 = playMove(base, [0, 0], uciMove(e5Fen, "Bc4"));

  // Broadcast actually plays 2. Nf3 Nc6.
  const incoming = importPgn("1. e4 e5 2. Nf3 Nc6").tree;
  const merged = mergeLiveMainline(withBc4.tree, incoming, [0, 0, 0]);

  assert.equal(merged.addedMoves, 2);
  const afterE5 = merged.tree.children[0]!.children[0]!.children;
  // Broadcast 2. Nf3 becomes mainline [0]; user's 2. Bc4 is preserved at [1].
  assert.equal(afterE5[0]!.san, "Nf3");
  assert.equal(afterE5[0]!.children[0]!.san, "Nc6");
  assert.equal(afterE5[1]!.san, "Bc4");
  // Cursor that was on 2. Bc4 ([0, 0, 0]) is relocated to [0, 0, 1] so the board doesn't jump.
  assert.deepEqual(merged.path, [0, 0, 1]);
  assert.equal(getNodeAt(merged.tree, merged.path)?.san, "Bc4");
});

test("mergeLiveMainline returns addedMoves 0 when already up to date", () => {
  const local = importPgn("1. e4 e5 2. Nf3").tree;
  const incoming = importPgn("1. e4 e5 2. Nf3").tree;
  const merged = mergeLiveMainline(local, incoming, [0, 0]);
  assert.equal(merged.addedMoves, 0);
  assert.equal(merged.diverged, false);
  assert.equal(merged.tree, local);
});

test("mergeLiveMainline reports diverged when starting FEN differs", () => {
  const local = importPgn('[FEN "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"]\n\n1... e5').tree;
  const incoming = importPgn("1. e4 e5 2. Nf3").tree;
  const merged = mergeLiveMainline(local, incoming, []);
  assert.equal(merged.diverged, true);
  assert.equal(merged.addedMoves, 0);
  assert.equal(merged.tree, local);
});
