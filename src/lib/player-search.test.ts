import assert from "node:assert/strict";
import test from "node:test";
import {
  isClosedLichessUser,
  playerNameMatches,
  usableDisplayName,
  usernameCandidates,
} from "./player-search.ts";

test("matches Last, First against First Last", () => {
  assert.equal(playerNameMatches("Carlsen, Magnus", "Magnus Carlsen"), true);
  assert.equal(playerNameMatches("Carlsen, Magnus", "magnus"), true);
  assert.equal(playerNameMatches("Carlsen, Magnus", "kasparov"), false);
});

test("builds Chess.com/Lichess username candidates from a real name", () => {
  const candidates = usernameCandidates("Magnus Carlsen").map((item) => item.toLowerCase());
  assert.ok(candidates.includes("magnuscarlsen"));
});

test("treats disabled Lichess accounts as closed", () => {
  assert.equal(isClosedLichessUser({ disabled: true }), true);
  assert.equal(isClosedLichessUser({}), false);
});

test("falls back when Chess.com returns a punctuation-only name", () => {
  assert.equal(usableDisplayName(".", "carlsen"), "carlsen");
  assert.equal(usableDisplayName("GM Hikaru Nakamura", "hikaru"), "GM Hikaru Nakamura");
});
