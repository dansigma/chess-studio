import { validateFen } from "chess.js";

export function pieceCount(fen: string): number | null {
  const normalized = fen.trim().replace(/\s+/g, " ");
  if (!validateFen(normalized).ok) return null;
  return normalized.split(" ")[0].replace(/[^pnbrqk]/gi, "").length;
}

export function isTablebasePosition(fen: string): boolean {
  const count = pieceCount(fen);
  return count !== null && count >= 3 && count <= 7;
}
