// SIG-1225: walks a game through the opening book, one explorer position at a
// time, stopping at the first move that is not theory (see opening-theory.ts).
// Transport-free: the caller supplies `getPosition`, so the walk is unit-tested
// with a fake explorer and reused by the /api/explorer/book route.
import { Chess } from "chess.js";
import { isTheoryMove, type BookPosition } from "@/src/chess/opening-theory";

export type BookWalkResult = {
  /** False when the explorer could not be reached for the very first position. */
  available: boolean;
  /** Leading moves that are theory. */
  plies: number;
  /** The walk stopped early (time cap or a later lookup failed): the book is at least this long. */
  partial: boolean;
  /** Per walked ply: the position's game count and the played move's game count. */
  counts: Array<{ total: number; move: number }>;
};

export type BookWalkOptions = {
  /** Total time allowed, ms. */
  budgetMs: number;
  now?: () => number;
};

/** Plays `ucis` from the standard start; null when a move is illegal. */
export function standardFens(ucis: readonly string[]): string[] | null {
  const chess = new Chess();
  const fens = [chess.fen()];
  for (const uci of ucis) {
    try {
      chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length > 4 ? uci[4] : undefined });
    } catch {
      return null;
    }
    fens.push(chess.fen());
  }
  return fens;
}

export async function walkBook(
  ucis: readonly string[],
  fens: readonly string[],
  getPosition: (fen: string, remainingMs: number) => Promise<BookPosition | null>,
  options: BookWalkOptions,
): Promise<BookWalkResult> {
  const now = options.now ?? Date.now;
  const startedAt = now();
  const result: BookWalkResult = { available: true, plies: 0, partial: false, counts: [] };
  for (let index = 0; index < ucis.length; index += 1) {
    const remaining = options.budgetMs - (now() - startedAt);
    if (remaining <= 0) {
      result.partial = true;
      return result;
    }
    const position = await getPosition(fens[index], remaining);
    if (!position) {
      if (index === 0) {
        return { available: false, plies: 0, partial: false, counts: [] };
      }
      result.partial = true;
      return result;
    }
    const move = position.moves.find((entry) => entry.uci === ucis[index]);
    result.counts.push({ total: position.total, move: move?.games ?? 0 });
    if (!isTheoryMove(position, ucis[index])) {
      return result;
    }
    result.plies += 1;
  }
  return result;
}
