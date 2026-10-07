import assert from "node:assert/strict";
import test from "node:test";
import {
  MOVE_NOTATION_IDS,
  formatSan,
  formatSanAtPly,
  isMoveNotation,
  sideFromFen,
} from "./move-notation.ts";

const START_W =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const START_B =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1";

test("isMoveNotation accepts the six known ids", () => {
  for (const id of MOVE_NOTATION_IDS) {
    assert.equal(isMoveNotation(id), true);
  }
  assert.equal(MOVE_NOTATION_IDS.length, 6);
});

test("isMoveNotation rejects unknown, empty and non-string values", () => {
  assert.equal(isMoveNotation("klingon"), false);
  assert.equal(isMoveNotation(""), false);
  assert.equal(isMoveNotation(null), false);
  assert.equal(isMoveNotation(undefined), false);
  assert.equal(isMoveNotation(42), false);
});

test("sideFromFen reads the side to move, defaulting to white", () => {
  assert.equal(sideFromFen(START_W), "w");
  assert.equal(sideFromFen(START_B), "b");
  assert.equal(sideFromFen("garbage"), "w");
});

test("formatSan is identity in english", () => {
  assert.equal(formatSan("Nf3", "english"), "Nf3");
  assert.equal(formatSan("e8=Q", "english", "b"), "e8=Q");
});

test("formatSan maps piece letters per language", () => {
  assert.equal(formatSan("Nf3", "german"), "Sf3");
  assert.equal(formatSan("Qh5", "spanish"), "Dh5");
  assert.equal(formatSan("Bb5", "portuguese"), "Bb5");
  assert.equal(formatSan("Ra1", "portuguese"), "Ta1");
  assert.equal(formatSan("Nf3", "russian"), "Кf3");
  // pawn moves are untouched
  assert.equal(formatSan("e4", "german"), "e4");
});

test("formatSan maps promotion suffixes", () => {
  assert.equal(formatSan("e8=Q", "german"), "e8=D");
  assert.equal(formatSan("e8=N", "spanish"), "e8=C");
});

test("formatSan passes castling and null-move tokens through", () => {
  assert.equal(formatSan("O-O", "german"), "O-O");
  assert.equal(formatSan("O-O-O", "russian"), "O-O-O");
  assert.equal(formatSan("--", "german"), "--");
  assert.equal(formatSan("Z0", "german"), "Z0");
});

test("formatSan uses white or black unicode glyphs by color", () => {
  assert.equal(formatSan("Nf3", "unicode", "w"), "♘f3");
  assert.equal(formatSan("Nf3", "unicode", "b"), "♞f3");
});

test("formatSanAtPly alternates color from the start side", () => {
  assert.equal(formatSanAtPly("Nf3", "unicode", "w", 0), "♘f3");
  assert.equal(formatSanAtPly("Nf3", "unicode", "w", 1), "♞f3");
  assert.equal(formatSanAtPly("Nf3", "unicode", "b", 0), "♞f3");
  assert.equal(formatSanAtPly("Nf3", "unicode", "b", 1), "♘f3");
  // non-unicode styles ignore color
  assert.equal(formatSanAtPly("Nf3", "german", "w", 0), "Sf3");
  assert.equal(formatSanAtPly("Nf3", "german", "w", 1), "Sf3");
});
