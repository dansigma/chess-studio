import { fileOf, relativeRank, squareName, type Analysis } from "./board";
import type { Color, KingSafetyFact } from "./types";

const FILE_LETTERS = "abcdefgh";
const CASTLED_SQUARES: Record<Color, string[]> = {
  w: ["g1", "h1", "c1", "b1"],
  b: ["g8", "h8", "c8", "b8"],
};

export function computeKingSafety(analysis: Analysis, castling: string): KingSafetyFact[] {
  const facts: KingSafetyFact[] = [];
  for (const color of ["w", "b"] as const) {
    const king = analysis.kings[color];
    if (king === null) {
      continue;
    }
    const kingFile = fileOf(king);
    const kingRank = relativeRank(king, color);
    const square = squareName(king);
    const canCastle = {
      king: castling.includes(color === "w" ? "K" : "k"),
      queen: castling.includes(color === "w" ? "Q" : "q"),
    };
    const castled =
      !canCastle.king && !canCastle.queen && CASTLED_SQUARES[color].includes(square);

    const shieldPawns: string[] = [];
    const missing: string[] = [];
    const openFiles: KingSafetyFact["openFiles"] = [];
    for (let file = Math.max(0, kingFile - 1); file <= Math.min(7, kingFile + 1); file++) {
      let shielded = false;
      let ownPawn = false;
      let enemyPawn = false;
      for (let i = 0; i < 64; i++) {
        const piece = analysis.board[i];
        if (piece?.type !== "p" || fileOf(i) !== file) {
          continue;
        }
        if (piece.color === color) {
          ownPawn = true;
          const ahead = relativeRank(i, color) - kingRank;
          if (ahead === 1 || ahead === 2) {
            shielded = true;
            shieldPawns.push(squareName(i));
          }
        } else {
          enemyPawn = true;
        }
      }
      const letter = FILE_LETTERS[file] ?? "a";
      if (!shielded) {
        missing.push(letter);
      }
      if (!ownPawn) {
        openFiles.push({ file: letter, openness: enemyPawn ? "half-open" : "open" });
      }
    }
    facts.push({
      color,
      square,
      castling: castled ? "castled" : "uncastled",
      canCastle,
      shieldPawns,
      missingShieldFiles: missing,
      shieldIntact: missing.length === 0,
      openFiles,
    });
  }
  return facts;
}
