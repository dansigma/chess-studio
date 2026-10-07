import { Chess, type PieceSymbol } from "chess.js";

export type GamePhase = "opening" | "middlegame" | "endgame";

export type Division = {
  middle: number | null;
  end: number | null;
};

const MAJOR_MINOR = new Set<PieceSymbol>(["n", "b", "r", "q"]);

type Placement = {
  majors: number;
  whiteBack: number;
  blackBack: number;
  white: boolean[][];
  black: boolean[][];
};

function placement(fen: string): Placement {
  const board = new Chess(fen).board();
  const white = Array.from({ length: 8 }, () => Array<boolean>(8).fill(false));
  const black = Array.from({ length: 8 }, () => Array<boolean>(8).fill(false));
  let majors = 0;
  let whiteBack = 0;
  let blackBack = 0;
  for (let rankFromTop = 0; rankFromTop < 8; rankFromTop += 1) {
    for (let file = 0; file < 8; file += 1) {
      const piece = board[rankFromTop]?.[file];
      if (!piece) {
        continue;
      }
      const rank = 7 - rankFromTop;
      if (piece.color === "w") {
        white[file][rank] = true;
        if (rank === 0) {
          whiteBack += 1;
        }
      } else {
        black[file][rank] = true;
        if (rank === 7) {
          blackBack += 1;
        }
      }
      if (MAJOR_MINOR.has(piece.type)) {
        majors += 1;
      }
    }
  }
  return { majors, whiteBack, blackBack, white, black };
}

function regionScore(rank: number, white: number, black: number): number {
  if (white === 0) {
    if (black === 1) return 1 + rank;
    if (black === 2) return rank < 6 ? 2 + (6 - rank) : 0;
    if (black === 3 || black === 4) return rank < 7 ? 3 + (7 - rank) : 0;
    return 0;
  }
  if (white === 1) {
    if (black === 0) return 1 + (8 - rank);
    if (black === 1) return 5 + Math.abs(4 - rank);
    if (black === 2) return 4 + (7 - rank);
    if (black === 3) return 5 + (7 - rank);
    return 0;
  }
  if (white === 2) {
    if (black === 0) return rank > 2 ? 2 + (rank - 2) : 0;
    if (black === 1) return 4 + (rank - 1);
    if (black === 2) return 7;
    return 0;
  }
  if (white === 3 || white === 4) {
    if (black === 0) return rank > 1 ? 3 + (rank - 1) : 0;
    if (white === 3 && black === 1) return 5 + (rank - 1);
    return 0;
  }
  return 0;
}

function mixedness(place: Placement): number {
  let total = 0;
  for (let rank = 0; rank < 7; rank += 1) {
    for (let file = 0; file < 7; file += 1) {
      let white = 0;
      let black = 0;
      for (let dx = 0; dx < 2; dx += 1) {
        for (let dy = 0; dy < 2; dy += 1) {
          if (place.white[file + dx]?.[rank + dy]) {
            white += 1;
          }
          if (place.black[file + dx]?.[rank + dy]) {
            black += 1;
          }
        }
      }
      total += regionScore(rank + 1, white, black);
    }
  }
  return total;
}

export function dividePhases(fens: string[]): Division {
  const boards = fens.map(placement);
  let middle: number | null = null;
  for (let index = 0; index < boards.length; index += 1) {
    const board = boards[index];
    if (board.majors <= 10 || board.whiteBack < 4 || board.blackBack < 4 || mixedness(board) > 150) {
      middle = index;
      break;
    }
  }
  let end: number | null = null;
  if (middle != null) {
    for (let index = 0; index < boards.length; index += 1) {
      if (boards[index].majors <= 6) {
        end = index;
        break;
      }
    }
  }
  if (middle != null && end != null && middle >= end) {
    middle = null;
  }
  return { middle, end };
}

export function phaseAt(division: Division, ply: number): GamePhase {
  if (division.end != null && ply >= division.end) {
    return "endgame";
  }
  if (division.middle != null && ply >= division.middle) {
    return "middlegame";
  }
  return "opening";
}
