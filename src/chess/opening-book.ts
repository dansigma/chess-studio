// SIG-1226: local opening book lookups. The build script and the browser both
// derive position keys here, so a book built offline matches what the review
// computes (same FEN -> FNV-1a position hash in zobrist.ts -> unsigned 64-bit).
import { Chess } from "chess.js";
import { unsignedKey, type OpeningBook } from "./opening-book-format.ts";
import { positionKey } from "./zobrist.ts";

/** Book key of a FEN: the app's position key as an unsigned 64-bit integer. */
export function bookKey(fen: string): bigint {
  return unsignedKey(positionKey(fen));
}

export type LocalBookWalk = {
  /** Leading moves of the line that are theory in the local book. */
  plies: number;
  /**
   * True when every move the book covers (its maxPly) is theory and the line
   * goes on, so the book cannot say where theory ends: ask the explorer.
   */
  needsMore: boolean;
};

/**
 * Walks `ucis` from `startFen` and stops at the first move that is not in the
 * book (for either side; transpositions after that never count). Moves past
 * `book.maxPly` are not covered.
 */
export function walkLocalBook(book: OpeningBook, startFen: string, ucis: readonly string[]): LocalBookWalk {
  const board = new Chess(startFen);
  const limit = Math.min(ucis.length, book.maxPly);
  let plies = 0;
  while (plies < limit) {
    const uci = ucis[plies];
    if (!book.hasMove(bookKey(board.fen()), uci)) {
      return { plies, needsMore: false };
    }
    try {
      board.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    } catch {
      return { plies, needsMore: false };
    }
    plies += 1;
  }
  return { plies, needsMore: plies === book.maxPly && ucis.length > book.maxPly };
}
