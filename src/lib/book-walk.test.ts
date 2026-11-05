import assert from "node:assert/strict";
import test from "node:test";
import type { BookPosition } from "@/src/chess/opening-theory";
import { standardFens, walkBook } from "./book-walk.ts";

// 1.e4 e5 2.Nf3 Nc6 3.Bb5 a6 then 4.h4 (a rare move) and a transposing 5.Ba4.
const GAME = ["e2e4", "e7e5", "g1f3", "b8c6", "f1b5", "a7a6", "h2h4", "g8f6", "b5a4"];

/** Fake explorer keyed by ply: every position is popular and lists the game's move as `share` of its games. */
function explorer(overrides: Record<number, BookPosition | null> = {}) {
  const fens = standardFens(GAME) ?? [];
  const byFen = new Map<string, BookPosition | null>();
  GAME.forEach((uci, ply) => {
    byFen.set(fens[ply], ply in overrides ? overrides[ply] : { total: 5000, moves: [{ uci, games: 2500 }] });
  });
  const calls: string[] = [];
  return {
    fens,
    calls,
    get: async (fen: string) => {
      calls.push(fen);
      return byFen.get(fen) ?? null;
    },
  };
}

test("the book runs while every move is theory and reports per-ply counts", async () => {
  const fake = explorer();
  const result = await walkBook(GAME.slice(0, 6), fake.fens, fake.get, { budgetMs: 1000 });
  assert.equal(result.available, true);
  assert.equal(result.partial, false);
  assert.equal(result.plies, 6);
  assert.deepEqual(result.counts[0], { total: 5000, move: 2500 });
  assert.equal(result.counts.length, 6);
});

test("the book ends at the first move that fails, for either side, and nothing is looked up after it", async () => {
  for (const failingPly of [6, 7]) {
    const fake = explorer({ [failingPly]: { total: 5000, moves: [{ uci: GAME[failingPly], games: 10 }] } });
    const result = await walkBook(GAME, fake.fens, fake.get, { budgetMs: 1000 });
    assert.equal(result.plies, failingPly, `ply ${failingPly} (${failingPly % 2 === 0 ? "white" : "black"}) ends the book`);
    assert.equal(fake.calls.length, failingPly + 1, "no lookups past the failing move");
    assert.deepEqual(result.counts[failingPly], { total: 5000, move: 10 });
  }
});

test("a transposition back into known positions after the book ended is not book", async () => {
  // Ply 6 fails; ply 8 (5.Ba4) would be theory on its own but is never reached or counted.
  const fake = explorer({ 6: { total: 5000, moves: [{ uci: "h2h4", games: 5 }] } });
  const result = await walkBook(GAME, fake.fens, fake.get, { budgetMs: 1000 });
  assert.equal(result.plies, 6);
  assert.ok(!fake.calls.includes(fake.fens[8]));
});

test("a position under 100 games or a move under 3% ends the book", async () => {
  const small = explorer({ 2: { total: 99, moves: [{ uci: "g1f3", games: 99 }] } });
  assert.equal((await walkBook(GAME, small.fens, small.get, { budgetMs: 1000 })).plies, 2);
  const share = explorer({ 3: { total: 1000, moves: [{ uci: "b8c6", games: 25 }] } });
  assert.equal((await walkBook(GAME, share.fens, share.get, { budgetMs: 1000 })).plies, 3);
});

test("a failed first lookup means the book is unavailable", async () => {
  const fake = explorer({ 0: null });
  const result = await walkBook(GAME, fake.fens, fake.get, { budgetMs: 1000 });
  assert.deepEqual(result, { available: false, plies: 0, partial: false, counts: [] });
});

test("a failure after some book moves stops there and says partial", async () => {
  const fake = explorer({ 4: null });
  const result = await walkBook(GAME, fake.fens, fake.get, { budgetMs: 1000 });
  assert.equal(result.available, true);
  assert.equal(result.partial, true);
  assert.equal(result.plies, 4);
});

test("the time budget caps the walk and returns what it has as partial", async () => {
  const fake = explorer();
  let clock = 0;
  const result = await walkBook(GAME, fake.fens, async (fen) => {
    clock += 400;
    return fake.get(fen);
  }, { budgetMs: 1000, now: () => clock });
  assert.equal(result.partial, true);
  assert.ok(result.plies >= 1 && result.plies < GAME.length);
});

test("standardFens rejects an illegal move", () => {
  assert.equal(standardFens(["e2e5"]), null);
  assert.equal(standardFens(["e2e4"])?.length, 2);
});
