import assert from "node:assert/strict";
import test from "node:test";
import { isExplorerFen, isPlayerUsername, isSearchQuery, isStudioPlayerName } from "./request-validation.ts";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const START_FEN_NO_COUNTERS = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -";

test("accepts the start position with counters", () => {
  assert.equal(isExplorerFen(START_FEN), true);
});

test("accepts the start position without counters", () => {
  assert.equal(isExplorerFen(START_FEN_NO_COUNTERS), true);
});

test("rejects null, empty and oversized FEN", () => {
  assert.equal(isExplorerFen(null), false);
  assert.equal(isExplorerFen(""), false);
  assert.equal(isExplorerFen(`${START_FEN} ${"x".repeat(120)}`), false);
});

test("rejects bad charset FEN", () => {
  assert.equal(isExplorerFen("zzz"), false);
  assert.equal(isExplorerFen("not a fen at all!!!!"), false);
});

test("username accepts normal names and rejects bad or long ones", () => {
  assert.equal(isPlayerUsername("hikaru"), true);
  assert.equal(isPlayerUsername("Magnus-Carlsen_1"), true);
  assert.equal(isPlayerUsername("bad name!"), false);
  assert.equal(isPlayerUsername(""), false);
  assert.equal(isPlayerUsername(null), false);
  assert.equal(isPlayerUsername("a".repeat(41)), false);
  assert.equal(isPlayerUsername("a".repeat(40)), true);
});

test("search query enforces length boundaries", () => {
  assert.equal(isSearchQuery("a"), false);
  assert.equal(isSearchQuery("ab"), true);
  assert.equal(isSearchQuery("a".repeat(40)), true);
  assert.equal(isSearchQuery("a".repeat(41)), false);
  assert.equal(isSearchQuery(null), false);
  assert.equal(isSearchQuery("  "), false);
});

test("studio names allow Last, First spellings the strict username rejects", () => {
  assert.equal(isStudioPlayerName("Capablanca, Jose"), true);
  assert.equal(isPlayerUsername("Capablanca, Jose"), false);
  assert.equal(isStudioPlayerName("José Raúl Capablanca"), true);
  assert.equal(isStudioPlayerName("a".repeat(80)), true);
  assert.equal(isStudioPlayerName("a".repeat(81)), false);
  assert.equal(isStudioPlayerName(null), false);
  assert.equal(isStudioPlayerName("Player (BRA)"), true);
  assert.equal(isStudioPlayerName("a" + String.fromCharCode(10) + "b"), false);
  assert.equal(isStudioPlayerName(String.fromCharCode(0) + "abc"), false);
  assert.equal(isStudioPlayerName("Capablanca\u202e, Jose"), false);
});
