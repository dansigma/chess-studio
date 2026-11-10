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
  /** En passant target square from the FEN ("e3"); only emitted when plausible. */
  enPassant?: string;
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
  const ep = parts[3] && /^[a-h][36]$/.test(parts[3]) ? parts[3] : undefined;
  return { pieces, turn, castling, ...(ep ? { enPassant: ep } : {}) };
}

/** Squares where the side to move could capture en passant, judging by pawn placement only. */
export function enPassantCandidates(pieces: Record<string, SetupPiece>, turn: "w" | "b"): string[] {
  const out: string[] = [];
  for (const file of FILES) {
    const [pawn, pawnRank, target, behind, targetRank] =
      turn === "w" ? (["bP", 5, 6, 7, 6] as const) : (["wP", 4, 3, 2, 3] as const);
    if (pieces[`${file}${pawnRank}`] === pawn && !pieces[`${file}${target}`] && !pieces[`${file}${behind}`]) {
      out.push(`${file}${targetRank}`);
    }
  }
  return out;
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
  const ep =
    position.enPassant && enPassantCandidates(position.pieces, position.turn).includes(position.enPassant)
      ? position.enPassant
      : "-";
  return `${ranks.join("/")} ${position.turn} ${castleRights(position.pieces, position.castling)} ${ep} 0 1`;
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

export type PositionProblem =
  | { code: "kings"; white: number; black: number }
  | { code: "pawnRank" }
  | { code: "opponentInCheck" }
  | { code: "invalid"; message: string };

/** Structured legality check used by the Library position search (SIG-1281). */
export function positionProblem(fen: string): PositionProblem | null {
  const position = parseSetupFen(fen);
  const all = Object.values(position.pieces);
  const white = all.filter((piece) => piece === "wK").length;
  const black = all.filter((piece) => piece === "bK").length;
  if (white !== 1 || black !== 1) {
    return { code: "kings", white, black };
  }
  if (Object.entries(position.pieces).some(([sq, piece]) => piece.endsWith("P") && (sq[1] === "1" || sq[1] === "8"))) {
    return { code: "pawnRank" };
  }
  const message = setupFenError(fen);
  if (message) {
    return { code: "invalid", message: message.replace(/^Error:\s*/, "") };
  }
  try {
    // The side NOT to move must not be in check: pass the move and ask chess.js.
    const flipped = buildSetupFen({ ...position, turn: position.turn === "w" ? "b" : "w", enPassant: undefined });
    if (new Chess(flipped).inCheck()) {
      return { code: "opponentInCheck" };
    }
  } catch (error) {
    return { code: "invalid", message: error instanceof Error ? error.message : "Invalid FEN" };
  }
  return null;
}
