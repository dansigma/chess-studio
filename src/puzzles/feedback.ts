import type { PuzzleTheme } from "./types";

export function puzzleGoal(themes: readonly PuzzleTheme[]): string {
  if (themes.includes("mateIn1")) {
    return "Mate in one move.";
  }
  if (themes.includes("mateIn2")) {
    return "Mate in two moves.";
  }
  if (themes.includes("promotion")) {
    return "Promote the pawn.";
  }
  if (themes.includes("fork")) {
    return "One move attacks two pieces. Find the fork.";
  }
  if (themes.includes("pin")) {
    return "A piece is pinned. Win it.";
  }
  if (themes.includes("skewer")) {
    return "Check the king. The piece behind it falls.";
  }
  if (themes.includes("discoveredAttack")) {
    return "Step aside and uncover a check.";
  }
  if (themes.includes("backRank")) {
    return "The king is stuck on the back rank.";
  }
  if (themes.includes("sacrifice")) {
    return "Give up material. The mate is worth it.";
  }
  if (themes.includes("mate")) {
    return "Find the checkmate.";
  }
  return "Find the best move.";
}

export function solvedPraise(streak: number): string {
  if (streak >= 5) {
    return "These puzzles are coming easy.";
  }
  if (streak === 4) {
    return "Four in a row. Great work!";
  }
  if (streak === 3) {
    return "1-2-3 in a row. Great work!";
  }
  if (streak === 2) {
    return "Two in a row. Keep going.";
  }
  return "Great stuff!";
}

export function squareAnchor(square: string, orientation: "white" | "black"): { x: number; y: number } | null {
  if (!/^[a-h][1-8]$/.test(square)) {
    return null;
  }
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]) - 1;
  const x = orientation === "white" ? file : 7 - file;
  const y = orientation === "white" ? 7 - rank : rank;
  return { x: (x + 0.5) / 8, y: (y + 0.08) / 8 };
}
