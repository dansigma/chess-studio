import assert from "node:assert/strict";
import test from "node:test";
import { BOOK_RULE, bookCacheSource, bookFilterQuery, isTheoryMove, type BookPosition } from "./opening-theory.ts";

const position = (total: number, moves: Array<[string, number]>): BookPosition => ({
  total,
  moves: moves.map(([uci, games]) => ({ uci, games })),
});

test("the rule constants live in one object", () => {
  assert.equal(BOOK_RULE.minPositionGames, 100);
  assert.equal(BOOK_RULE.minMoveGames, 20);
  assert.equal(BOOK_RULE.minMoveShare, 0.03);
  assert.deepEqual([...BOOK_RULE.ratings], [2200, 2500]);
  assert.deepEqual([...BOOK_RULE.speeds], ["blitz", "rapid", "classical"]);
  assert.equal(bookFilterQuery(), "&ratings=2200,2500&speeds=blitz,rapid,classical");
});

test("a move with enough games, enough share, in a big enough position is theory", () => {
  assert.equal(isTheoryMove(position(1000, [["e2e4", 600], ["d2d4", 400]]), "e2e4"), true);
});

test("a position under 100 games has no theory, even for its only move", () => {
  assert.equal(isTheoryMove(position(99, [["e2e4", 99]]), "e2e4"), false);
  assert.equal(isTheoryMove(position(100, [["e2e4", 100]]), "e2e4"), true);
});

test("a move under 20 games is not theory, whatever its share", () => {
  assert.equal(isTheoryMove(position(100, [["e2e4", 81], ["d2d4", 19]]), "d2d4"), false);
  assert.equal(isTheoryMove(position(100, [["e2e4", 80], ["d2d4", 20]]), "d2d4"), true);
});

test("a move under 3% of the position is not theory, even with 20+ games", () => {
  // 20 games of 1000 = 2%
  assert.equal(isTheoryMove(position(1000, [["e2e4", 980], ["d2d4", 20]]), "d2d4"), false);
  // 30 games of 1000 = exactly 3%
  assert.equal(isTheoryMove(position(1000, [["e2e4", 970], ["d2d4", 30]]), "d2d4"), true);
  assert.equal(isTheoryMove(position(1000, [["e2e4", 971], ["d2d4", 29]]), "d2d4"), false);
});

test("a move the explorer does not list is not theory", () => {
  assert.equal(isTheoryMove(position(1000, [["e2e4", 1000]]), "a2a3"), false);
});

test("cache source is versioned by rule and filters, so it never collides with masters/lichess entries", () => {
  const source = bookCacheSource();
  assert.ok(source.startsWith(`lichess-book-v${BOOK_RULE.version}-`));
  assert.ok(source.includes("2200-2500") && source.includes("blitz-rapid-classical"));
  assert.notEqual(source, "lichess");
  assert.notEqual(source, "masters");
});
