import {
  relativeRank,
  squareName,
  type Analysis,
} from "./board";
import type { Color, DiagonalFact, FileFact, SeventhRankFact } from "./types";

const FILE_LETTERS = "abcdefgh";

export function computeFileFacts(analysis: Analysis): FileFact[] {
  const { board } = analysis;
  const facts: FileFact[] = [];
  for (let file = 0; file < 8; file++) {
    const pawns: Record<Color, number> = { w: 0, b: 0 };
    const heavy: string[] = [];
    for (let rank = 0; rank < 8; rank++) {
      const piece = board[rank * 8 + file];
      if (!piece) {
        continue;
      }
      if (piece.type === "p") {
        pawns[piece.color] += 1;
      } else if (piece.type === "r" || piece.type === "q") {
        heavy.push(squareName(rank * 8 + file));
      }
    }
    const letter = FILE_LETTERS[file] ?? "a";
    if (pawns.w === 0 && pawns.b === 0) {
      facts.push({ file: letter, openness: "open", halfOpenFor: null, heavyPieces: heavy });
    } else if (pawns.w === 0 || pawns.b === 0) {
      facts.push({
        file: letter,
        openness: "half-open",
        halfOpenFor: pawns.w === 0 ? "w" : "b",
        heavyPieces: heavy,
      });
    }
  }
  return facts;
}

export function computeSeventhRankFacts(analysis: Analysis): SeventhRankFact[] {
  const { board } = analysis;
  const facts: SeventhRankFact[] = [];
  for (const color of ["w", "b"] as const) {
    const squares: string[] = [];
    for (let i = 0; i < 64; i++) {
      const piece = board[i];
      if (piece?.color === color && (piece.type === "r" || piece.type === "q") && relativeRank(i, color) === 6) {
        squares.push(squareName(i));
      }
    }
    if (squares.length > 0) {
      facts.push({ color, squares });
    }
  }
  return facts;
}

// a1-h8 runs a1(0) .. h8(63) in steps of 9; h1-a8 runs h1(7) .. a8(56) in 7s.
const DIAGONALS: Array<{ id: "a1h8" | "h1a8"; squares: number[] }> = [
  { id: "a1h8", squares: Array.from({ length: 8 }, (_, k) => k * 9) },
  { id: "h1a8", squares: Array.from({ length: 8 }, (_, k) => 7 + k * 7) },
];

/** Square names of a long diagonal, from its rank-1 end to its rank-8 end. */
export function diagonalSquares(id: "a1h8" | "h1a8"): string[] {
  return (DIAGONALS.find((diagonal) => diagonal.id === id)?.squares ?? []).map(squareName);
}

/**
 * A bishop or queen "controls" a long diagonal when it stands on it with an
 * empty path to both central squares. Contested when both sides do.
 */
export function computeDiagonalFacts(analysis: Analysis): DiagonalFact[] {
  const { board } = analysis;
  const facts: DiagonalFact[] = [];
  for (const { id, squares } of DIAGONALS) {
    const centers = [3, 4];
    const controllers: Record<Color, string[]> = { w: [], b: [] };
    squares.forEach((index, position) => {
      const piece = board[index];
      if (!piece || (piece.type !== "b" && piece.type !== "q")) {
        return;
      }
      // Every square between the piece and each center must be empty. A center
      // holding an enemy piece does not block (it is contested); one holding a
      // friendly piece does.
      const clear = centers.every((center) => {
        if (center === position) {
          return true;
        }
        const lo = center > position ? position + 1 : center;
        const hi = center > position ? center : position - 1;
        for (let k = lo; k <= hi; k++) {
          const occupant = board[squares[k] ?? -1];
          if (occupant && (k !== center || occupant.color === piece.color)) {
            return false;
          }
        }
        return true;
      });
      if (clear) {
        controllers[piece.color].push(squareName(index));
      }
    });
    const white = controllers.w.length > 0;
    const black = controllers.b.length > 0;
    if (!white && !black) {
      continue;
    }
    facts.push({
      diagonal: id,
      controller: white && black ? null : white ? "w" : "b",
      pieces: [...controllers.w, ...controllers.b],
    });
  }
  return facts;
}

