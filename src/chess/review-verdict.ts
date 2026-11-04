// SIG-1207: one-line verdict for the review summary card and the copied
// summary. Covers both players (the user's side is unknown for imported games).
import type { SiteLocale } from "../i18n/locale.ts";
import { formatDecimal1 } from "../i18n/format.ts";
import { formatSan, type MoveNotation } from "./move-notation.ts";
import { isPlaceholderPlayer } from "./player-names.ts";
import type { ReviewLabel } from "./review.ts";
import type { ReviewReport, SideReport } from "./review-report.ts";
import { tReview } from "./review-strings.ts";
import { moveNumberForPath } from "./tree.ts";
import type { Path } from "./tree.ts";

export type VerdictRow = {
  path: Path;
  san: string;
  side: "w" | "b";
  label: ReviewLabel | null;
  /** Win-chance points given up versus the engine's best line. */
  winLoss: number;
  lossCp: number;
};

export type VerdictInput = {
  report: ReviewReport;
  /** Every reviewed row (not only the filtered key moments), in game order. */
  rows: VerdictRow[];
  moveNotation: MoveNotation;
  startFen: string;
  /** True while only a partial preview exists; no verdict is shown then. */
  partial?: boolean;
};

const ANNOTATION: Partial<Record<ReviewLabel, string>> = { blunder: "??", mistake: "?" };

/** The blunder or mistake with the largest win-chance swing (lossCp breaks ties, then the earlier move). */
export function turningPoint<T extends Pick<VerdictRow, "label" | "winLoss" | "lossCp">>(rows: T[]): T | null {
  let best: T | null = null;
  for (const row of rows) {
    if (row.label !== "blunder" && row.label !== "mistake") {
      continue;
    }
    if (best == null || row.winLoss > best.winLoss || (row.winLoss === best.winLoss && row.lossCp > best.lossCp)) {
      best = row;
    }
  }
  return best;
}

function sideText(locale: SiteLocale, side: SideReport, color: "w" | "b"): string | null {
  if (side.accuracy == null) {
    return null;
  }
  const who = isPlaceholderPlayer(side.name) ? tReview(locale, color === "w" ? "verdict.white" : "verdict.black") : side.name.trim();
  return `${who} ${formatDecimal1(locale, side.accuracy)}%`;
}

/** "White 68.2%, Black 67.0%. The game turned on move 14 (Bxf7??)." or null when there is nothing to say yet. */
export function buildReviewVerdict(locale: SiteLocale, input: VerdictInput): string | null {
  if (input.partial) {
    return null;
  }
  const sides = [sideText(locale, input.report.white, "w"), sideText(locale, input.report.black, "b")].filter(
    (text): text is string => text != null,
  );
  const turn = turningPoint(input.rows);
  const tail =
    turn == null
      ? tReview(locale, "verdict.clean")
      : tReview(locale, "verdict.turned")
          .replace("{move}", String(moveNumberForPath(input.startFen, turn.path.length)))
          .replace("{san}", `${formatSan(turn.san, input.moveNotation, turn.side)}${ANNOTATION[turn.label as ReviewLabel] ?? ""}`);
  return sides.length > 0 ? `${sides.join(", ")}. ${tail}` : tail;
}
