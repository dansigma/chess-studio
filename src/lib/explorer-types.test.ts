import assert from "node:assert/strict";
import test from "node:test";
import { isExplorerResponse, type ExplorerResponse } from "./explorer-types.ts";
import { toJson } from "./supabase/database.types.ts";

const valid: ExplorerResponse = {
  source: "lichess",
  fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  white: 10,
  draws: 5,
  black: 8,
  opening: { eco: "A00", name: "Start" },
  moves: [
    { san: "e4", uci: "e2e4", games: 10, white: 5, draws: 2, black: 3, averageRating: null },
  ],
  games: [],
};

test("isExplorerResponse accepts a valid payload", () => {
  assert.equal(isExplorerResponse(valid), true);
});

test("isExplorerResponse rejects non-objects and mistyped fields", () => {
  assert.equal(isExplorerResponse(null), false);
  assert.equal(isExplorerResponse({}), false);
  assert.equal(isExplorerResponse({ ...valid, moves: "nope" }), false);
  assert.equal(isExplorerResponse({ ...valid, moves: [{ san: 1, uci: "e2e4", games: 1 }] }), false);
  assert.equal(isExplorerResponse({ ...valid, white: "10" }), false);
});

test("toJson round-trips explorer payloads through JSON", () => {
  assert.deepEqual(JSON.parse(JSON.stringify(toJson(valid))), valid);
});

test("toJson mirrors JSON.stringify edge cases", () => {
  assert.deepEqual(toJson({ a: undefined, b: 1 }), { b: 1 });
  assert.equal(toJson(Number.NaN), null);
  assert.equal(toJson(10n), "10");
});
