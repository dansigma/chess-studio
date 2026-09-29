import { Chess, type Move } from "chess.js";

const VARIATION_START = 255;
const VARIATION_END = 254;
const COMMENT = 253;
const NAG = 252;

function squareIndex(square: string): number {
  return square.charCodeAt(0) - 97 + (Number(square[1]) - 1) * 8;
}

function moveRank(move: Move): [number, number, number, number] {
  const from = squareIndex(move.from);
  const to = squareIndex(move.to);
  const promo = move.promotion ? "qrbn".indexOf(move.promotion) : -1;
  if (move.isKingsideCastle() || move.isQueensideCastle()) {
    return [8, from, to, promo];
  }
  if (move.piece === "p" && move.captured) {
    return [0, from, to, promo];
  }
  if (move.piece === "p" && move.flags.includes("b")) {
    return [2, from, to, promo];
  }
  if (move.piece === "p") {
    return [1, from, to, promo];
  }
  const pieceOrder: Record<string, number> = { n: 3, b: 4, r: 5, q: 6, k: 7 };
  return [pieceOrder[move.piece] ?? 9, from, to, promo];
}

function compareMoves(a: Move, b: Move): number {
  const left = moveRank(a);
  const right = moveRank(b);
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) {
      return left[i] - right[i];
    }
  }
  return 0;
}

/** Legal moves in the order Caissabase / shakmaty indexes them. */
export function indexedLegalMoves(chess: Chess): Move[] {
  return chess.moves({ verbose: true }).sort(compareMoves);
}

export function uciOf(move: Move): string {
  return `${move.from}${move.to}${move.promotion ?? ""}`;
}

export type DecodedMove = {
  san: string;
  uci: string;
  fen: string;
};

/**
 * Replay a Caissabase Moves blob. Variations, comments and NAGs are skipped.
 * Returns the mainline only.
 */
export function decodeMoveBlob(
  blob: Uint8Array,
  startFen?: string | null,
  maxPly = Number.POSITIVE_INFINITY,
): DecodedMove[] {
  const chess = new Chess(startFen && startFen !== "start" ? startFen : undefined);
  const moves: DecodedMove[] = [];
  let i = 0;
  let variationDepth = 0;

  while (i < blob.length) {
    const byte = blob[i];
    if (byte === VARIATION_START) {
      variationDepth += 1;
      i += 1;
      continue;
    }
    if (byte === VARIATION_END) {
      variationDepth = Math.max(0, variationDepth - 1);
      i += 1;
      continue;
    }
    if (byte === COMMENT || byte === NAG) {
      if (i + 2 >= blob.length) {
        break;
      }
      const length = blob[i + 1] + blob[i + 2] * 256;
      i += 3 + length;
      continue;
    }
    i += 1;
    if (variationDepth > 0) {
      continue;
    }
    const move = indexedLegalMoves(chess)[byte];
    if (!move) {
      break;
    }
    const played = chess.move(move);
    if (!played) {
      break;
    }
    moves.push({ san: played.san, uci: uciOf(played), fen: chess.fen() });
    if (moves.length >= maxPly) {
      break;
    }
  }

  return moves;
}
