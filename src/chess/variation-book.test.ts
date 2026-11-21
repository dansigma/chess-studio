import assert from "node:assert/strict";
import test from "node:test";
import { Chess } from "chess.js";
import { bookKey } from "./opening-book.ts";
import { decodeCountsBook, encodeCountsBook, type CountsEntry } from "./opening-book-counts-format.ts";
import { encodeMove } from "./opening-book-format.ts";
import { flattenMainLine, type TreeNode } from "./tree.ts";
import { buildVariationBook, VARIATION_LEVELS, type VariationBookOptions } from "./variation-book.ts";

function play(board: Chess, uci: string) {
  return board.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
}

class Fixture {
  private positions = new Map<bigint, CountsEntry[]>();

  add(board: Chess, moves: Record<string, number>, total = 100) {
    const key = bookKey(board.fen());
    this.positions.set(key, Object.entries(moves).map(([uci, count]) => ({
      key, move: encodeMove(uci), count, total,
    })));
  }

  book(maxPly = 40) {
    return decodeCountsBook(encodeCountsBook([...this.positions.values()].flat(), { maxPly }));
  }
}

const options = {
  startUci: [], color: "white", level: "beginner",
} satisfies VariationBookOptions;

test("plays the most common move on every user turn and counts the start moves for either color", () => {
  const fixture = new Fixture();
  const board = new Chess();
  play(board, "e2e4");
  fixture.add(board, { e7e5: 55, c7c5: 20 });
  play(board, "e7e5");
  fixture.add(board, { g1f3: 40, f1c4: 30 });

  const startUci = ["e2e4"];
  const white = buildVariationBook(fixture.book(), { ...options, startUci });
  const [e4] = white.tree.children;
  assert.deepEqual(e4.children.map((node) => node.uci), ["e7e5", "c7c5"]);
  const [nf3] = e4.children[0].children;
  const move = play(board, "g1f3");
  assert.equal(e4.children[0].children.length, 1);
  assert.deepEqual(
    { san: nf3.san, uci: nf3.uci, from: nf3.from, to: nf3.to, fen: nf3.fen },
    { san: "Nf3", uci: "g1f3", from: "g1", to: "f3", fen: move.after },
  );
  assert.equal(white.lines, 2);
  assert.equal(white.userMoves, 2);

  const black = buildVariationBook(fixture.book(), { ...options, startUci, color: "black" });
  assert.deepEqual(black.tree.children[0].children.map((node) => node.uci), ["e7e5"]);
  assert.deepEqual(black.tree.children[0].children[0].children.map((node) => node.uci), ["g1f3", "f1c4"]);
  assert.equal(black.lines, 2);
  assert.equal(black.userMoves, 1);
});

test("uses the position total and stops once the level's coverage is met", () => {
  const fixture = new Fixture();
  fixture.add(new Chess(), { e2e4: 45, d2d4: 25, c2c4: 15, g1f3: 8, b2b3: 4, g2g3: 3 });
  const book = fixture.book();
  for (const [level, replies] of [
    ["beginner", ["e2e4", "d2d4"]],
    ["intermediate", ["e2e4", "d2d4", "c2c4"]],
    ["advanced", ["e2e4", "d2d4", "c2c4", "g1f3", "b2b3"]],
  ] as const) {
    const result = buildVariationBook(book, { ...options, color: "black", level });
    assert.deepEqual(result.tree.children.map((node) => node.uci), replies);
    assert.equal(result.lines, replies.length);
    assert.equal(result.userMoves, 0);
  }
});

test("applies minimum reply shares without renormalizing book counts", () => {
  const fixture = new Fixture();
  fixture.add(new Chess(), { e2e4: 10, d2d4: 5, c2c4: 2, g1f3: 1 });
  const book = fixture.book();
  for (const [level, replies] of [
    ["beginner", ["e2e4"]],
    ["intermediate", ["e2e4", "d2d4"]],
    ["advanced", ["e2e4", "d2d4", "c2c4"]],
  ] as const) {
    const result = buildVariationBook(book, { ...options, color: "black", level });
    assert.deepEqual(result.tree.children.map((node) => node.uci), replies);
  }
});

test("limits beginner to two replies even when they miss coverage", () => {
  const fixture = new Fixture();
  fixture.add(new Chess(), { e2e4: 30, d2d4: 20, c2c4: 15 });
  const result = buildVariationBook(fixture.book(), { ...options, color: "black" });
  assert.deepEqual(result.tree.children.map((node) => node.uci), ["e2e4", "d2d4"]);
});

test("multiplies opponent shares, includes the cutoff, and ignores the user's move share", () => {
  const fixture = new Fixture();
  const board = new Chess();
  fixture.add(board, { e2e4: 1 });
  play(board, "e2e4");
  fixture.add(board, { e7e5: 20 });
  play(board, "e7e5");
  fixture.add(board, { g1f3: 1 });
  play(board, "g1f3");
  fixture.add(board, { b8c6: 25, g8f6: 24 });
  const result = buildVariationBook(fixture.book(), options);
  assert.deepEqual(flattenMainLine(result.tree).map((node) => node.uci), ["e2e4", "e7e5", "g1f3", "b8c6"]);
  assert.equal(result.lines, 1);
});

test("stops after both sides play the last full move or when book depth ends", () => {
  const fixture = new Fixture();
  const board = new Chess();
  for (const uci of ["g1f3", "g8f6", "f3g1", "f6g8"]) {
    fixture.add(board, { [uci]: 100 });
    play(board, uci);
  }
  for (const level of Object.keys(VARIATION_LEVELS) as VariationBookOptions["level"][]) {
    const result = buildVariationBook(fixture.book(), { ...options, level });
    assert.equal(flattenMainLine(result.tree).length, 2 * VARIATION_LEVELS[level].lastMove);
    assert.equal(result.userMoves, VARIATION_LEVELS[level].lastMove);
  }
  const shortBook = buildVariationBook(fixture.book(3), options);
  assert.equal(flattenMainLine(shortBook.tree).length, 3);
});

test("preserves the supplied line when its final position is missing from the book", () => {
  const fixture = new Fixture();
  fixture.add(new Chess(), { d2d4: 100 });
  const result = buildVariationBook(fixture.book(), { ...options, startUci: ["e2e4", "e7e5"] });
  assert.deepEqual(flattenMainLine(result.tree).map((node) => node.uci), ["e2e4", "e7e5"]);
  assert.equal(result.lines, 1);
  assert.equal(result.userMoves, 1);
  assert.equal(result.capped, false);
});

test("caps at 600 user moves and keeps higher-reach branches across the tree", () => {
  const fixture = new Fixture();
  const white = [
    ["b2b3", "b2b4", "a2a4"],
    ["c2c3", "c2c4", "d2d3"],
    ["e2e3", "e2e4", "f2f3"],
    ["g2g3", "g2g4", "h2h3"],
  ];
  const black = ["a7a6", "b7b6", "c7c6", "d7d6"];
  const board = new Chess();
  function populate(ply: number, firstReply?: string) {
    if (ply === 8) {
      for (const uci of ["b1a3", "g8f6", "a3b1", "f6g8"]) {
        fixture.add(board, { [uci]: 100 });
        play(board, uci);
      }
      for (let i = 0; i < 4; i += 1) board.undo();
      return;
    }
    const turn = Math.floor(ply / 2);
    const moves = ply % 2 === 0 ? white[turn] : [black[turn]];
    let games = [34, 33, 33];
    if (ply === 0) games = [36, 34, 30];
    if (ply === 2 && firstReply === "b2b3") games = [45, 35, 20];
    if (ply === 2 && firstReply === "a2a4") games = [60, 20, 20];
    fixture.add(board, Object.fromEntries(moves.map((uci, i) => [uci, moves.length === 1 ? 100 : games[i]])));
    for (const uci of moves) {
      play(board, uci);
      populate(ply + 1, firstReply ?? uci);
      board.undo();
    }
  }
  populate(0);

  const book = fixture.book();
  const settings = { ...options, level: "advanced", color: "black" } as const;
  const result = buildVariationBook(book, settings);
  assert.equal(result.capped, true);
  assert.equal(result.userMoves, 600);
  // Node ids are random UUIDs; everything else must be deterministic.
  const withoutIds = (value: unknown) => JSON.parse(JSON.stringify(value, (key, item) => (key === "id" ? undefined : item)));
  assert.deepEqual(withoutIds(result), withoutIds(buildVariationBook(book, settings)));

  const [first, , last] = result.tree.children;
  const lowReachReply = first.children[0].children.find((node) => node.uci === "d2d3");
  assert.ok(lowReachReply);
  assert.equal(flattenMainLine({ startFen: lowReachReply.fen, children: lowReachReply.children }).length, 3);
  assert.equal(flattenMainLine({ startFen: last.fen, children: last.children }).length, 39);

  let lines = 0;
  let moves = 0;
  function visit(nodes: TreeNode[], ply: number) {
    if (nodes.length === 0) lines += 1;
    if (ply % 2 === 0) moves += nodes.length;
    for (const node of nodes) visit(node.children, ply + 1);
  }
  visit(result.tree.children, 1);
  assert.equal(result.lines, lines);
  assert.equal(result.userMoves, moves);
});
