// SIG-1226: local book walking and key parity with the zobrist module.
import assert from "node:assert/strict";
import test from "node:test";
import { Chess } from "chess.js";
import { bookKey, walkLocalBook } from "./opening-book.ts";
import { decodeBook, encodeBook, encodeMove } from "./opening-book-format.ts";
import { positionKey } from "./zobrist.ts";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function uciLine(sans: string): { fens: string[]; ucis: string[] } {
  const board = new Chess();
  const fens = [board.fen()];
  const ucis: string[] = [];
  for (const san of sans.split(" ")) {
    const move = board.move(san);
    ucis.push(move.from + move.to + (move.promotion ?? ""));
    fens.push(board.fen());
  }
  return { fens, ucis };
}

/** A book that holds exactly the first `theory` plies of `sans`. */
function bookOf(sans: string, theory: number, maxPly = 40) {
  const { fens, ucis } = uciLine(sans);
  const entries = ucis.slice(0, theory).map((uci, i) => ({ key: bookKey(fens[i]), move: encodeMove(uci) }));
  return decodeBook(encodeBook(entries, { maxPly }));
}

test("bookKey is the unsigned form of the app's position key", () => {
  for (const fen of [START, "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1", "rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3"]) {
    assert.equal(bookKey(fen), BigInt.asUintN(64, positionKey(fen)));
    assert.ok(bookKey(fen) >= 0n && bookKey(fen) < 2n ** 64n);
  }
});

test("key golden values: castling rights and en passant squares change the key, clocks do not", () => {
  // Fixed values: a book built offline is only valid while these never change.
  assert.equal(bookKey(START), 0xe7550032f70614fcn);
  assert.equal(bookKey("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1"), 0x8b06f12ebda3e52cn);
  assert.equal(bookKey("rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3"), 0xa1e9e283848555d9n);
  assert.equal(bookKey(`${START.split(" ").slice(0, 4).join(" ")} 17 40`), bookKey(START), "clocks ignored");
  assert.notEqual(bookKey("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1"), bookKey("r3k2r/8/8/8/8/8/8/R3K2R w Kkq - 0 1"));
  assert.notEqual(
    bookKey("rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3"),
    bookKey("rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq - 0 3"),
  );
});

test("walk stops at the first move that is not theory", () => {
  const sans = "e4 e5 Nf3 Nc6 Bb5 a6";
  const { ucis } = uciLine(sans);
  assert.deepEqual(walkLocalBook(bookOf(sans, 6), START, ucis), { plies: 6, needsMore: false });
  assert.deepEqual(walkLocalBook(bookOf(sans, 3), START, ucis), { plies: 3, needsMore: false });
  assert.deepEqual(walkLocalBook(bookOf(sans, 0), START, ucis), { plies: 0, needsMore: false });
});

test("the book ends on either side's move and never resumes after a transposition", () => {
  // Black deviates at ply 1 (odd): known after e4 e5, the played move is not in the book.
  const mainline = uciLine("e4 e5 Nf3 Nc6");
  const odd = uciLine("e4 c5 Nf3 Nc6");
  const book = bookOf("e4 e5 Nf3 Nc6", 4);
  assert.equal(walkLocalBook(book, START, odd.ucis).plies, 1);
  // White's move 3 differs but the position later transposes back into book squares:
  // 1.e4 e5 2.Nc3 Nc6 3.Nf3 reaches the main line position after 3.Nf3 Nc6 only by transposition.
  const transposed = uciLine("e4 e5 Nc3 Nc6 Nf3");
  const walk = walkLocalBook(book, START, transposed.ucis);
  assert.equal(walk.plies, 2, "ends at 2.Nc3 and the later positions do not count");
  assert.equal(mainline.ucis.length, 4);
});

test("lines past the covered ply cap ask for more only while still in book", () => {
  const sans = "e4 e5 Nf3 Nc6 Bb5 a6";
  const { ucis } = uciLine(sans);
  const capped = bookOf(sans, 4, 4);
  assert.deepEqual(walkLocalBook(capped, START, ucis), { plies: 4, needsMore: true });
  assert.deepEqual(walkLocalBook(capped, START, ucis.slice(0, 4)), { plies: 4, needsMore: false }, "line ends at the cap");
  const offBook = uciLine("e4 e5 Nf3 d6 Bc4 Nf6");
  assert.deepEqual(walkLocalBook(capped, START, offBook.ucis), { plies: 3, needsMore: false });
});
