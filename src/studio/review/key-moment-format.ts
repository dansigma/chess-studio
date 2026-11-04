// SIG-1208: pure formatting for the one-line key-moment rows.
import { lineToSan } from "@/src/chess/explain/gather";
import { formatSan, type MoveNotation } from "@/src/chess/move-notation";
import { tReview } from "@/src/chess/review-strings";
import { formatDecimal1 } from "@/src/i18n/format";
import type { SiteLocale } from "@/src/i18n/locale";

/** Evaluations at or beyond this many pawns are mate scores (see evalSeries). */
const MATE_PAWNS = 900;

/**
 * White-perspective evaluation as a signed string: "+0.3", "-2.1", "0.0".
 * Decimals follow the locale; mate scores (no distance is stored) show "+M" / "-M".
 */
export function formatMomentEval(locale: SiteLocale, pawns: number): string {
  if (Math.abs(pawns) >= MATE_PAWNS) {
    return pawns > 0 ? "+M" : "-M";
  }
  const text = formatDecimal1(locale, pawns);
  // Rounds to zero: no sign ("-0.0" would read as a loss).
  if (Number(text.replace(",", ".")) === 0) {
    return formatDecimal1(locale, 0);
  }
  return pawns > 0 ? `+${text}` : text;
}

/**
 * SAN of the engine's first choice from the position before the move, or null
 * when there is none, it is illegal there, or it is the move that was played.
 */
export function momentBestSan(fenBefore: string, playedUci: string, bestPv: string[]): string | null {
  const first = bestPv[0];
  if (!first || first === playedUci) {
    return null;
  }
  return lineToSan(fenBefore, [first])[0]?.san ?? null;
}

/** "best: Nd5" with the notation applied for the mover's side; null when hidden. */
export function momentBestLabel(
  locale: SiteLocale,
  moveNotation: MoveNotation,
  side: "w" | "b",
  bestSan: string | null,
): string | null {
  return bestSan ? tReview(locale, "moments.best").replace("{san}", formatSan(bestSan, moveNotation, side)) : null;
}

/** "14." for White's move, "14..." for Black's, as in the notation. */
export function momentNumberLabel(moveNumber: number, side: "w" | "b"): string {
  return side === "w" ? `${moveNumber}.` : `${moveNumber}...`;
}
