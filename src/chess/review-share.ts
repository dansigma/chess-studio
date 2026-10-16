// SIG-968: pure localized plain-text review summary for clipboard share.
// No React/store imports — the panel supplies the finished report, the
// visible (filtered) key moments, and the tree start FEN for move numbers.
import type { SiteLocale } from "../i18n/locale.ts";
import { formatDecimal1, formatInteger } from "../i18n/format.ts";
import { formatSan, type MoveNotation } from "./move-notation.ts";
import { moveNumberForPath } from "./tree.ts";
import type { Path } from "./tree.ts";
import { tierName, tReview } from "./review-strings.ts";
import type { ReviewReport, SideReport } from "./review-report.ts";
import type { ReviewLabel } from "./review.ts";

export type ReviewSummaryMoment = {
  path: Path;
  san: string;
  side: "w" | "b";
  label: ReviewLabel | null;
};

export type ReviewSummaryInput = {
  report: ReviewReport;
  moments: ReviewSummaryMoment[];
  moveNotation: MoveNotation;
  startFen: string;
  openingName?: string | null;
};

function ratingValue(side: SideReport, locale: SiteLocale): string {
  const { value, anchored } = side.gameRating;
  if (value == null) {
    return "—";
  }
  const text = formatInteger(locale, value);
  return anchored ? text : `≈ ${text}`;
}

function playerName(side: SideReport): string {
  if (side.rating == null) {
    return side.name;
  }
  return `${side.name} (${side.rating})`;
}

function sideLine(side: SideReport, locale: SiteLocale): string {
  // Reuse the card labels; the rating label carries a " ⓘ" tooltip marker in
  // the UI tables that has no place in plain text.
  const accuracyLabel = tReview(locale, "report.accuracy");
  const avgLossLabel = tReview(locale, "report.avgLoss");
  const ratingLabel = tReview(locale, "report.gameRating").replace(" ⓘ", "");
  const accuracy = side.accuracy == null ? "—" : formatDecimal1(locale, side.accuracy);
  const acpl = side.acpl == null ? "—" : formatInteger(locale, side.acpl);
  return `${playerName(side)}: ${accuracyLabel} ${accuracy}, ${avgLossLabel} ${acpl}, ${ratingLabel} ${ratingValue(side, locale)}`;
}

function momentLine(moment: ReviewSummaryMoment, locale: SiteLocale, input: ReviewSummaryInput): string | null {
  if (moment.label == null) {
    return null;
  }
  const moveNumber = moveNumberForPath(input.startFen, moment.path.length);
  const prefix = moment.side === "w" ? `${moveNumber}.` : `${moveNumber}...`;
  const san = formatSan(moment.san, input.moveNotation, moment.side);
  return `${prefix} ${san} — ${tierName(locale, moment.label)}`;
}

/**
 * Localized multi-line summary: title, players, per-side accuracy/ACPL/
 * rating, then key moments as `12. Nf3 — Mistake`. Empty moments fall back
 * to the card's no-mistakes copy.
 */
export function buildReviewSummary(locale: SiteLocale, input: ReviewSummaryInput): string {
  const lines: string[] = [tReview(locale, "share.summaryTitle")];
  if (input.openingName) {
    lines.push(input.openingName);
  }
  lines.push(`${playerName(input.report.white)} vs ${playerName(input.report.black)}`);
  lines.push(sideLine(input.report.white, locale));
  lines.push(sideLine(input.report.black, locale));
  lines.push(tReview(locale, "report.keyMoments"));
  const rendered = input.moments.flatMap((moment) => {
    const line = momentLine(moment, locale, input);
    return line == null ? [] : [line];
  });
  if (rendered.length === 0) {
    lines.push(tReview(locale, "report.noMistakes"));
  } else {
    lines.push(...rendered);
  }
  return lines.join("\n");
}
