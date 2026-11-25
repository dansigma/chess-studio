import { Chess, type Move } from "chess.js";

export const HISTORY_LENGTH = 8;
export const BOARD_SQUARES = 64;
export const TOKEN_WIDTH = HISTORY_LENGTH * 12 + 1;

const FILES = "abcdefgh";
const PIECES = "pnbrqk";
const PROMOTIONS = "qrbn";

function squareIndex(square: string, mirror: boolean): number {
  const rank = Number(square[1]);
  return (mirror ? 8 - rank : rank - 1) * 8 + FILES.indexOf(square[0]);
}

// The vocabulary is all 64 × 64 square pairs, followed by the rank 7 → 8
// promotions in source-file, destination-file, q/r/b/n order.
export function moveIndex(move: Move): number {
  if (move.promotion) {
    return 4096 + (FILES.indexOf(move.from[0]) * 8 + FILES.indexOf(move.to[0])) * 4
      + PROMOTIONS.indexOf(move.promotion);
  }
  const mirror = move.color === "b";
  return squareIndex(move.from, mirror) * BOARD_SQUARES + squareIndex(move.to, mirror);
}

export function encodeHistory(fens: readonly string[]): Float32Array {
  if (fens.length === 0) throw new Error("Maia requires a current position");
  const history = fens.slice(-HISTORY_LENGTH);
  const padding = HISTORY_LENGTH - history.length;
  const tokens = new Float32Array(BOARD_SQUARES * TOKEN_WIDTH);

  history.forEach((fen, index) => {
    const board = new Chess(fen);
    // Each history entry has its own side-to-move perspective. The final
    // channel (ponder time in the reference implementation) stays zero.
    const mirror = board.turn() === "b";
    for (const rank of board.board()) {
      for (const piece of rank) {
        if (!piece) continue;
        const square = squareIndex(piece.square, mirror);
        const channel = PIECES.indexOf(piece.type) + (piece.color === board.turn() ? 0 : 6);
        const firstSlot = index === 0 ? 0 : padding + index;
        for (let slot = firstSlot; slot <= padding + index; slot++) {
          tokens[square * TOKEN_WIDTH + slot * 12 + channel] = 1;
        }
      }
    }
  });
  return tokens;
}

// Sparse legal mask. Keeping the original UCI strings avoids unmirroring
// candidate moves after scoring.
export function legalMoves(board: Chess) {
  return board.moves({ verbose: true }).map((move) => ({
    index: moveIndex(move),
    uci: move.lan,
    after: move.after,
  }));
}
