import { Chess } from "chess.js";
import { START_FEN } from "./tree";

export type SetupPiece =
  | "wP"
  | "wN"
  | "wB"
  | "wR"
  | "wQ"
  | "wK"
  | "bP"
  | "bN"
  | "bB"
  | "bR"
  | "bQ"
  | "bK";

export const WHITE_SETUP_PIECES: SetupPiece[] = ["wK", "wQ", "wR", "wB", "wN", "wP"];
export const BLACK_SETUP_PIECES: SetupPiece[] = ["bK", "bQ", "bR", "bB", "bN", "bP"];

const FEN_LETTER: Record<SetupPiece, string> = {
  wP: "P",
  wN: "N",
  wB: "B",
  wR: "R",
  wQ: "Q",
  wK: "K",
  bP: "p",
  bN: "n",
  bB: "b",
  bR: "r",
  bQ: "q",
  bK: "k",
};

const LETTER_TO_PIECE: Record<string, SetupPiece> = {
  P: "wP",
  N: "wN",
  B: "wB",
  R: "wR",
  Q: "wQ",
  K: "wK",
  p: "bP",
  n: "bN",
  b: "bB",
  r: "bR",
  q: "bQ",
  k: "bK",
};

const FILES = "abcdefgh";

export type SetupPosition = {
  pieces: Record<string, SetupPiece>;
  turn: "w" | "b";
  /** Castling rights pasted with the FEN (`KQkq` alphabet, `"-"` for none). */
  castling: string;
};

export function emptySetupPosition(): SetupPosition {
  // Default to full rights so hand-building from an empty board (place
  // K/R on e1/h1/a1/…) can regain rights via intersection in castleRights.
  // An empty board still builds "-" (no corner pieces to intersect), and
  // pasted "-"/garbage still sanitizes to "-" in parseSetupFen.
  return { pieces: {}, turn: "w", castling: "KQkq" };
}

/** Sanitize a pasted castling field to the canonical `KQkq` order (`"-"` when empty). */
function sanitizeCastlingField(field: string): string {
  let kept = "";
  for (const right of "KQkq") {
    if (field.includes(right)) {
      kept += right;
    }
  }
  return kept || "-";
}

export function parseSetupFen(fen: string): SetupPosition {
  const parts = fen.trim().split(/\s+/);
  const board = parts[0] ?? START_FEN.split(" ")[0];
  const turn = parts[1] === "b" ? "b" : "w";
  const castling = sanitizeCastlingField(parts[2] ?? "-");
  const pieces: Record<string, SetupPiece> = {};
  const ranks = board.split("/");
  for (let rankIndex = 0; rankIndex < 8; rankIndex += 1) {
    const rank = ranks[rankIndex];
    if (!rank) {
      continue;
    }
    let fileIndex = 0;
    for (const char of rank) {
      if (fileIndex >= 8) {
        break;
      }
      if (char >= "1" && char <= "8") {
        fileIndex += Number(char);
        continue;
      }
      const piece = LETTER_TO_PIECE[char];
      const file = FILES[fileIndex];
      if (piece && file) {
        pieces[`${file}${8 - rankIndex}`] = piece;
      }
      fileIndex += 1;
    }
  }
  return { pieces, turn, castling };
}

function castleRights(pieces: Record<string, SetupPiece>, kept: string): string {
  let rights = "";
  if (kept.includes("K") && pieces.e1 === "wK" && pieces.h1 === "wR") {
    rights += "K";
  }
  if (kept.includes("Q") && pieces.e1 === "wK" && pieces.a1 === "wR") {
    rights += "Q";
  }
  if (kept.includes("k") && pieces.e8 === "bK" && pieces.h8 === "bR") {
    rights += "k";
  }
  if (kept.includes("q") && pieces.e8 === "bK" && pieces.a8 === "bR") {
    rights += "q";
  }
  return rights || "-";
}

export function buildSetupFen(position: SetupPosition): string {
  const ranks: string[] = [];
  for (let rank = 8; rank >= 1; rank -= 1) {
    let empty = 0;
    let row = "";
    for (const file of FILES) {
      const piece = position.pieces[`${file}${rank}`];
      if (!piece) {
        empty += 1;
        continue;
      }
      if (empty > 0) {
        row += String(empty);
        empty = 0;
      }
      row += FEN_LETTER[piece];
    }
    if (empty > 0) {
      row += String(empty);
    }
    ranks.push(row || "8");
  }
  return `${ranks.join("/")} ${position.turn} ${castleRights(position.pieces, position.castling)} - 0 1`;
}

export function isLegalSetupFen(fen: string): boolean {
  try {
    const chess = new Chess(fen);
    return chess.fen().split(" ")[0] === fen.split(" ")[0];
  } catch {
    return false;
  }
}

export function setupFenError(fen: string): string | null {
  try {
    new Chess(fen);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "Invalid FEN";
  }
}

export function placeSetupPiece(
  position: SetupPosition,
  square: string,
  piece: SetupPiece | null,
): SetupPosition {
  const pieces = { ...position.pieces };
  if (!piece) {
    delete pieces[square];
  } else {
    pieces[square] = piece;
  }
  return { ...position, pieces };
}

export function moveSetupPiece(
  position: SetupPosition,
  from: string,
  to: string,
): SetupPosition {
  if (from === to) {
    return position;
  }
  const piece = position.pieces[from];
  if (!piece) {
    return position;
  }
  const pieces = { ...position.pieces };
  delete pieces[from];
  pieces[to] = piece;
  return { ...position, pieces };
}
