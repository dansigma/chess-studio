import type { PuzzleTheme } from "./types";
import type { SiteLocale } from "@/src/i18n/locale";
import { tPuzzle } from "@/src/i18n/puzzle-strings";

// SIG-1070: coaching copy resolves through the puzzle string table so the
// trainer panel follows the store locale. Helpers stay pure (locale is an
// explicit parameter) to keep the node unit tests intact.
export function puzzleGoal(themes: readonly PuzzleTheme[], locale: SiteLocale): string {
  if (themes.includes("mateIn1")) {
    return tPuzzle(locale, "puzzle.goal.mateIn1");
  }
  if (themes.includes("mateIn2")) {
    return tPuzzle(locale, "puzzle.goal.mateIn2");
  }
  if (themes.includes("promotion")) {
    return tPuzzle(locale, "puzzle.goal.promotion");
  }
  if (themes.includes("fork")) {
    return tPuzzle(locale, "puzzle.goal.fork");
  }
  if (themes.includes("pin")) {
    return tPuzzle(locale, "puzzle.goal.pin");
  }
  if (themes.includes("skewer")) {
    return tPuzzle(locale, "puzzle.goal.skewer");
  }
  if (themes.includes("discoveredAttack")) {
    return tPuzzle(locale, "puzzle.goal.discoveredAttack");
  }
  if (themes.includes("backRank")) {
    return tPuzzle(locale, "puzzle.goal.backRank");
  }
  if (themes.includes("sacrifice")) {
    return tPuzzle(locale, "puzzle.goal.sacrifice");
  }
  if (themes.includes("mate")) {
    return tPuzzle(locale, "puzzle.goal.mate");
  }
  return tPuzzle(locale, "puzzle.goal.fallback");
}

export function solvedPraise(streak: number, locale: SiteLocale): string {
  if (streak >= 5) {
    return tPuzzle(locale, "puzzle.praise.streak5");
  }
  if (streak === 4) {
    return tPuzzle(locale, "puzzle.praise.streak4");
  }
  if (streak === 3) {
    return tPuzzle(locale, "puzzle.praise.streak3");
  }
  if (streak === 2) {
    return tPuzzle(locale, "puzzle.praise.streak2");
  }
  return tPuzzle(locale, "puzzle.praise.fallback");
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
