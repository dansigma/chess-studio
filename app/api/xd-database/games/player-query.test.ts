import assert from "node:assert/strict";
import test from "node:test";
import { Chess } from "chess.js";
import { bookKey } from "@/src/chess/opening-book";
import catalog from "@/src/data/openings-catalog.json" with { type: "json" };
import { replayReaches, targetShape } from "./player-query";

function sanLine(uci: readonly string[]): string {
  const board = new Chess();
  return uci.map((move) => board.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] }).san).join(" ");
}

function fenAfter(sans: string): string {
  const board = new Chess();
  for (const san of sans.split(" ")) board.move(san);
  return board.fen();
}

function naiveReaches(moves: string, maxPly: number, key: bigint): boolean {
  const board = new Chess();
  for (const san of moves.split(" ", maxPly)) {
    board.move(san);
    if (bookKey(board.fen()) === key) return true;
  }
  return false;
}

test("replayReaches finds a transposition and rejects games that never reach the position", () => {
  const fen = fenAfter("d4 d5 Nc3 Nf6 Bf4 c5");
  const key = bookKey(fen);
  const target = targetShape(fen);
  assert.equal(replayReaches("d4 Nf6 Nc3 d5 Bf4 c5 e3 cxd4 exd4", 50, key, target), true);
  assert.equal(replayReaches("e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6", 50, key, target), false);
  // Within the tree depth only.
  assert.equal(replayReaches("d4 Nf6 Nc3 d5 Bf4 c5", 5, key, target), false);
});

test("replayReaches agrees with a full replay on catalog lines", () => {
  const lines = catalog.filter((_, index) => index % 60 === 0).map(({ uci }) => sanLine(uci));
  const targets = catalog.filter((_, index) => index % 97 === 0).map(({ uci }) => sanLine(uci));
  let reached = 0;
  for (const targetLine of targets) {
    const fen = fenAfter(targetLine);
    const key = bookKey(fen);
    const shape = targetShape(fen);
    for (const moves of lines) {
      const expected = naiveReaches(moves, 50, key);
      if (expected) reached += 1;
      assert.equal(replayReaches(moves, 50, key, shape), expected, `${moves} → ${targetLine}`);
    }
  }
  assert.ok(reached > 0);
});
