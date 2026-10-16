"use client";

import { useId, useState } from "react";
import { formatSan, type MoveNotation } from "@/src/chess/move-notation";
import { REPORT_PHASES, type ReviewReport, type SideReport } from "@/src/chess/review-report";
import {
  keyMomentAccessibleName,
  phaseName,
  reviewPlayerFallback,
  tierName,
  tReview,
} from "@/src/chess/review-strings";
import { REVIEW_TIERS } from "@/src/chess/review-tiers";
import { REVIEW_LABELS, type ReviewLabel } from "@/src/chess/review";
import type { SiteLocale } from "@/src/i18n/locale";
import { formatDecimal1, formatInteger } from "@/src/i18n/format";
import { moveNumberForPath, pathsEqual, type Path } from "@/src/chess/tree";

export type KeyMomentRow = {
  path: Path;
  san: string;
  side: "w" | "b";
  label: ReviewLabel | null;
  /** 0-based ply index within the reviewed line (ReviewRow.index). */
  index: number;
  /** Centipawns lost on this move (ReviewRow.lossCp) — drives the "lost X pawns" clause. */
  lossCp: number;
};

type Props = {
  report: ReviewReport;
  moments: KeyMomentRow[];
  moveNotation: MoveNotation;
  locale: SiteLocale;
  onSelectMoment: (path: Path) => void;
  openingName?: string | null;
  /** Set when the reviewed line is not the main line. */
  lineNote?: string | null;
  /** Board path, to highlight the active key-moment row. */
  selectedPath?: Path | null;
  /** True when filters hid every moment (shows report.noFilteredMoments). */
  hasUnfilteredMoments?: boolean;
  /** Tree start FEN — derives display move numbers via moveNumberForPath. */
  startFen: string;
};

/** One decimal, so 86 shows as 86.0 (en) / 86,0 (pt-br) like the other column. */
function percent(value: number | null, locale: SiteLocale): string {
  return value == null ? "—" : formatDecimal1(locale, value);
}

function PlayerHeader({ side, color }: { side: SideReport; color: string }) {
  return (
    <div className="min-w-0 text-center">
      <div className="truncate text-dense font-semibold" title={side.name}>
        {side.name}
      </div>
      <div className="text-caption text-studio-faint">{side.rating != null ? side.rating : color}</div>
    </div>
  );
}

function ratingText(side: SideReport, locale: SiteLocale): string {
  const { value, anchored } = side.gameRating;
  if (value == null) {
    return "—";
  }
  const text = formatInteger(locale, value);
  return anchored ? text : `≈ ${text}`;
}

export function ReviewReportCard({
  report,
  moments,
  moveNotation,
  locale,
  onSelectMoment,
  openingName,
  lineNote,
  selectedPath = null,
  hasUnfilteredMoments = false,
  startFen,
}: Props) {
  const { white, black } = report;
  const ratingTooltip = tReview(locale, "report.ratingTooltip");
  const ratingDescId = useId();
  const [ratingOpen, setRatingOpen] = useState(false);
  return (
    <>
      <table className="w-full border-collapse">
        <caption className="sr-only">{tReview(locale, "panel.title")}</caption>
        <thead>
          <tr className="grid grid-cols-[88px_1fr_1fr] items-start gap-2 border-b border-studio-border-subtle px-3 py-2">
            <th scope="col" className="font-normal">
              <span className="sr-only">{tReview(locale, "report.accuracy")}</span>
            </th>
            <th scope="col" className="min-w-0 font-normal">
              <PlayerHeader side={white} color={reviewPlayerFallback(locale, "w")} />
            </th>
            <th scope="col" className="min-w-0 font-normal">
              <PlayerHeader side={black} color={reviewPlayerFallback(locale, "b")} />
            </th>
          </tr>
        </thead>
        <tbody>
          {openingName ? (
            <tr className="grid grid-cols-[88px_1fr_1fr] items-center gap-2 border-b border-studio-border-subtle px-3 py-1">
              <td colSpan={3} className="min-w-0 truncate text-caption text-studio-muted" title={openingName}>
                {openingName}
              </td>
            </tr>
          ) : null}
          {lineNote ? (
            <tr className="grid grid-cols-[88px_1fr_1fr] items-center gap-2 px-3 py-1">
              <td colSpan={3} className="text-caption text-studio-warning-fg">
                {lineNote}
              </td>
            </tr>
          ) : null}
          <tr className="grid grid-cols-[88px_1fr_1fr] items-center gap-2 border-b border-studio-border-subtle px-3 py-3">
            <th scope="row" className="text-left text-caption font-normal text-studio-faint">
              {tReview(locale, "report.accuracy")}
            </th>
            <td className="text-center text-2xl font-semibold tabular-nums">{percent(white.accuracy, locale)}</td>
            <td className="text-center text-2xl font-semibold tabular-nums">{percent(black.accuracy, locale)}</td>
          </tr>
          <tr className="grid grid-cols-[88px_1fr_1fr] items-center gap-2 px-3 py-1 text-dense">
            <th scope="row" className="text-left text-caption font-normal text-studio-faint">
              <span title={tReview(locale, "report.avgLossTitle")}>{tReview(locale, "report.avgLoss")}</span>
            </th>
            <td className="text-center tabular-nums text-studio-muted">
              {white.acpl == null ? "—" : formatInteger(locale, white.acpl)}
            </td>
            <td className="text-center tabular-nums text-studio-muted">
              {black.acpl == null ? "—" : formatInteger(locale, black.acpl)}
            </td>
          </tr>
          {REPORT_PHASES.map((phase) => (
            <tr
              key={phase.id}
              className="grid grid-cols-[88px_1fr_1fr] items-center gap-2 px-3 py-1 text-dense"
            >
              <th scope="row" className="text-left text-caption font-normal text-studio-faint">
                {phaseName(locale, phase.id)}
              </th>
              <td className="text-center tabular-nums text-studio-muted">{percent(white.phases[phase.id], locale)}</td>
              <td className="text-center tabular-nums text-studio-muted">{percent(black.phases[phase.id], locale)}</td>
            </tr>
          ))}
          {REVIEW_LABELS.map((label) => {
            const tier = REVIEW_TIERS[label];
            return (
              <tr
                key={label}
                className="grid grid-cols-[88px_1fr_1fr] items-center gap-2 border-t border-studio-border-subtle px-3 py-1 text-dense first:border-t-0"
              >
                <th scope="row" className="flex items-center gap-1.5 text-left font-normal">
                  <span aria-hidden className={`w-4 text-center font-semibold ${tier.className}`}>
                    {tier.icon}
                  </span>
                  <span>{tierName(locale, label)}</span>
                </th>
                <td className="text-center tabular-nums text-studio-muted">{white.counts[label]}</td>
                <td className="text-center tabular-nums text-studio-muted">{black.counts[label]}</td>
              </tr>
            );
          })}
          <tr className="grid grid-cols-[88px_1fr_1fr] items-center gap-2 px-3 py-1 text-dense">
            <th scope="row" className="flex items-center gap-1.5 text-left font-normal">
              <span title={tReview(locale, "report.forcedTooltip")} className="flex items-center gap-1.5">
                <span aria-hidden className={`w-4 text-center font-semibold ${REVIEW_TIERS.forced.className}`}>
                  {REVIEW_TIERS.forced.icon}
                </span>
                <span className="text-studio-muted">{tierName(locale, "forced")}</span>
              </span>
            </th>
            <td className="text-center tabular-nums text-studio-faint">{white.forced}</td>
            <td className="text-center tabular-nums text-studio-faint">{black.forced}</td>
          </tr>
          <tr className="grid grid-cols-[88px_1fr_1fr] items-center gap-2 border-y border-studio-border-subtle px-3 py-2">
            <th scope="row" className="text-left text-caption font-normal text-studio-faint">
              <button
                type="button"
                aria-expanded={ratingOpen}
                aria-controls={ratingDescId}
                aria-describedby={ratingOpen ? ratingDescId : undefined}
                onClick={() => setRatingOpen((open) => !open)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setRatingOpen(false);
                  }
                }}
                className="underline decoration-dotted underline-offset-2 hover:text-studio-fg focus-visible:outline-2 focus-visible:outline-studio-accent"
              >
                {tReview(locale, "report.gameRatingShort")} <span aria-hidden="true">ⓘ</span>
              </button>
            </th>
            <td className="text-center text-dense font-semibold tabular-nums">{ratingText(white, locale)}</td>
            <td className="text-center text-dense font-semibold tabular-nums">{ratingText(black, locale)}</td>
          </tr>
          {ratingOpen ? (
            <tr className="grid grid-cols-[88px_1fr_1fr] items-center gap-2 border-b border-studio-border-subtle px-3 py-2">
              <td colSpan={3}>
                <div role="note" id={ratingDescId} className="text-caption leading-relaxed text-studio-muted">
                  {ratingTooltip}
                </div>
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
      <div className="px-3 py-2 text-caption uppercase tracking-wide text-studio-faint">{tReview(locale, "report.keyMoments")}</div>
      {moments.length === 0 ? (
        <p className="px-3 pb-3 text-dense text-studio-faint">
          {tReview(locale, hasUnfilteredMoments ? "report.noFilteredMoments" : "report.noMistakes")}
        </p>
      ) : (
        <ul>
          {moments.map((row) => {
            if (!row.label) {
              return null;
            }
            const tier = REVIEW_TIERS[row.label];
            const active = selectedPath != null && pathsEqual(row.path, selectedPath);
            const moveNumber = moveNumberForPath(startFen, row.path.length);
            const accessibleName = keyMomentAccessibleName(locale, moveNotation, {
              moveNumber,
              san: row.san,
              side: row.side,
              tier: tierName(locale, row.label),
              lossCp: row.lossCp,
            });
            return (
              <li key={row.path.join(".")}>
                <button
                  type="button"
                  aria-current={active ? "true" : undefined}
                  aria-label={accessibleName}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-studio-hover${
                    active ? " bg-studio-hover-strong" : ""
                  }`}
                  onClick={() => onSelectMoment(row.path)}
                >
                  <span aria-hidden className={`w-6 text-center font-semibold ${tier.className}`}>
                    {tier.mark}
                  </span>
                  <span className="font-medium">{formatSan(row.san, moveNotation, row.side)}</span>
                  <span className="ml-auto text-caption text-studio-faint">{tierName(locale, row.label)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
