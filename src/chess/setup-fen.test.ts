import assert from "node:assert/strict";
import test from "node:test";
import { START_FEN } from "./tree.ts";
import {
  BLACK_SETUP_PIECES,
  WHITE_SETUP_PIECES,
  buildSetupFen,
  emptySetupPosition,
  isLegalSetupFen,
  moveSetupPiece,
  parseSetupFen,
  placeSetupPiece,
  setupFenError,
} from "./setup-fen.ts";

test("setup piece palettes contain the full set", () => {
  assert.deepEqual(WHITE_SETUP_PIECES, ["wK", "wQ", "wR", "wB", "wN", "wP"]);
  assert.deepEqual(BLACK_SETUP_PIECES, ["bK", "bQ", "bR", "bB", "bN", "bP"]);
});

test("emptySetupPosition starts empty on white to move", () => {
  assert.deepEqual(emptySetupPosition(), { pieces: {}, turn: "w", castling: "-" });
  assert.equal(buildSetupFen(emptySetupPosition()), "8/8/8/8/8/8/8/8 w - - 0 1");
});

test("parseSetupFen reads start position pieces and turn", () => {
  const pos = parseSetupFen(START_FEN);
  assert.equal(pos.turn, "w");
  assert.equal(pos.pieces.e1, "wK");
  assert.equal(pos.pieces.e8, "bK");
  assert.equal(pos.pieces.a2, "wP");
  const black = parseSetupFen(START_FEN.replace(" w ", " b "));
  assert.equal(black.turn, "b");
});

test("parseSetupFen defaults garbage turn to white", () => {
  assert.equal(parseSetupFen("8/8/8/8/8/8/8/8 x - - 0 1").turn, "w");
});

test("buildSetupFen round-trips the start position", () => {
  assert.equal(buildSetupFen(parseSetupFen(START_FEN)), START_FEN);
});

test("buildSetupFen derives castling rights from corner pieces", () => {
  const full = parseSetupFen(START_FEN);
  assert.equal(buildSetupFen(full).split(" ")[2], "KQkq");
  const noWhiteKingside = placeSetupPiece(full, "h1", null);
  assert.equal(buildSetupFen(noWhiteKingside).split(" ")[2], "Qkq");
  assert.equal(buildSetupFen(emptySetupPosition()).split(" ")[2], "-");
});

test("parseSetupFen preserves pasted castling rights (standard only)", () => {
  const kingsideOnly = parseSetupFen(`${START_FEN.split(" ")[0]} w K - 0 1`);
  assert.equal(kingsideOnly.castling, "K");
  assert.equal(buildSetupFen(kingsideOnly).split(" ")[2], "K");
  const queensideOnly = parseSetupFen(`${START_FEN.split(" ")[0]} w q - 0 1`);
  assert.equal(buildSetupFen(queensideOnly).split(" ")[2], "q");
});

test("parseSetupFen sanitizes the castling field to KQkq order", () => {
  const scrambled = parseSetupFen(`${START_FEN.split(" ")[0]} w qkQK - 0 1`);
  assert.equal(scrambled.castling, "KQkq");
  const garbage = parseSetupFen(`${START_FEN.split(" ")[0]} w xyz - 0 1`);
  assert.equal(garbage.castling, "-");
  assert.equal(buildSetupFen(garbage).split(" ")[2], "-");
});

test("buildSetupFen drops rights whose corner pieces are missing", () => {
  const noRook = placeSetupPiece(
    parseSetupFen(`${START_FEN.split(" ")[0]} w K - 0 1`),
    "h1",
    null,
  );
  assert.equal(buildSetupFen(noRook).split(" ")[2], "-");
});

test("isLegalSetupFen accepts the start and rejects garbage", () => {
  assert.equal(isLegalSetupFen(START_FEN), true);
  assert.equal(isLegalSetupFen("not a fen"), false);
});

test("setupFenError returns null for legal and a message otherwise", () => {
  assert.equal(setupFenError(START_FEN), null);
  assert.ok(typeof setupFenError("not a fen") === "string");
});

test("placeSetupPiece adds and removes without mutating", () => {
  const base = emptySetupPosition();
  const added = placeSetupPiece(base, "e4", "wP");
  assert.equal(added.pieces.e4, "wP");
  assert.equal(base.pieces.e4, undefined);
  const removed = placeSetupPiece(added, "e4", null);
  assert.equal(removed.pieces.e4, undefined);
});

test("moveSetupPiece moves, no-ops on same square or empty", () => {
  const base = placeSetupPiece(emptySetupPosition(), "e2", "wP");
  assert.equal(moveSetupPiece(base, "e2", "e2"), base);
  assert.equal(moveSetupPiece(base, "a1", "a2"), base);
  const moved = moveSetupPiece(base, "e2", "e4");
  assert.equal(moved.pieces.e4, "wP");
  assert.equal(moved.pieces.e2, undefined);
});
