import assert from "node:assert/strict";
import test from "node:test";
import { START_FEN } from "./tree.ts";
import {
  BLACK_SETUP_PIECES,
  WHITE_SETUP_PIECES,
  buildSetupFen,
  emptySetupPosition,
  isLegalSetupFen,
  moveSetupOrLegalPiece,
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
  assert.deepEqual(emptySetupPosition(), { pieces: {}, turn: "w", castling: "KQkq" });
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

test("hand-building the start position from empty regains castling rights", () => {
  let pos = emptySetupPosition();
  for (const [square, piece] of [
    ["e1", "wK"],
    ["a1", "wR"],
    ["h1", "wR"],
    ["e8", "bK"],
    ["a8", "bR"],
    ["h8", "bR"],
  ] as const) {
    pos = placeSetupPiece(pos, square, piece);
  }
  assert.equal(buildSetupFen(pos).split(" ")[2], "KQkq");
  // Without the kingside corner rooks, only queenside rights survive.
  const noKingside = placeSetupPiece(placeSetupPiece(pos, "h1", null), "h8", null);
  assert.equal(buildSetupFen(noKingside).split(" ")[2], "Qq");
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

test("legal opening moves alternate turns and normalize both clocks", () => {
  let fen = START_FEN;
  for (const [from, to, turn] of [["d2", "d4", "b"], ["d7", "d5", "w"], ["b1", "c3", "b"]]) {
    fen = moveSetupOrLegalPiece(fen, from, to);
    assert.equal(parseSetupFen(fen).turn, turn);
    assert.ok(fen.endsWith(" 0 1"));
  }
  assert.equal(fen, "rnbqkbnr/ppp1pppp/8/3p4/3P4/2N5/PPP1PPPP/R1BQKBNR b KQkq - 0 1");
});

test("legal castling moves the rook and clears the king's castling rights", () => {
  const fen = "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 6 20";
  assert.equal(moveSetupOrLegalPiece(fen, "e1", "g1"), "r3k2r/8/8/8/8/8/8/R4RK1 b kq - 0 1");
  assert.equal(moveSetupOrLegalPiece(fen, "e1", "c1"), "r3k2r/8/8/8/8/8/8/2KR3R b kq - 0 1");
});

test("a legal double push sets en passant and the next move can capture", () => {
  const fen = moveSetupOrLegalPiece("4k3/8/8/8/3p4/8/4P3/4K3 w - - 0 1", "e2", "e4");
  assert.equal(fen, "4k3/8/8/8/3pP3/8/8/4K3 b - e3 0 1");
  assert.equal(moveSetupOrLegalPiece(fen, "d4", "e3"), "4k3/8/8/8/8/4p3/8/4K3 w - - 0 1");
});

test("free moves preserve the turn for same-side moves and invalid diagrams", () => {
  const fen = moveSetupOrLegalPiece(START_FEN, "e2", "e4");
  assert.equal(moveSetupOrLegalPiece(fen, "d2", "d4"), "rnbqkbnr/pppppppp/8/8/3PP3/8/PPP2PPP/RNBQKBNR b KQkq - 0 1");
  assert.equal(moveSetupOrLegalPiece("8/8/8/8/8/8/4P3/8 w - - 5 10", "e2", "e4"), "8/8/8/8/4P3/8/8/8 w - - 0 1");
  assert.equal(moveSetupOrLegalPiece("4k3/8/8/8/8/8/4R3/4K3 w - - 0 1", "e2", "e3"),
    "4k3/8/8/8/8/4R3/8/4K3 w - - 0 1");
});
