"use client";

import { useId, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
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
import { REVIEW_LABELS, type ReviewLabel, type TierLabel } from "@/src/chess/review";
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

/** One decimal, so 86 shows as 86.0 (en) / 86,0 (pt-br) like the other column. */
function percent(value: number | null, locale: SiteLocale): string {
  return value == null ? "—" : formatDecimal1(locale, value);
}

function PlayerHeader({ side, color }: { side: SideReport; color: string }) {
  return (
    <div className="flex min-w-0 items-baseline justify-center gap-1.5 leading-tight">
      <span className="truncate text-dense font-semibold" title={side.name}>
        {side.name}
      </span>
      <span className="shrink-0 text-caption text-studio-faint">{side.rating != null ? side.rating : color}</span>
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

const ROW = "grid grid-cols-[88px_1fr_1fr] items-center gap-2 px-3";

/** Labels with a non-zero count for one side, in REVIEW_LABELS order. */
export function classificationChips(side: SideReport): Array<{ label: TierLabel; count: number }> {
  return REVIEW_LABELS.flatMap((label) => (side.counts[label] > 0 ? [{ label, count: side.counts[label] }] : []));
}

function ClassificationChips({ side, locale }: { side: SideReport; locale: SiteLocale }) {
  const chips = classificationChips(side);
  if (chips.length === 0) {
    return null;
  }
  return (
    <ul className="flex flex-wrap justify-center gap-x-2 gap-y-0.5">
      {chips.map(({ label, count }) => {
        const tier = REVIEW_TIERS[label];
        return (
          <li
            key={label}
            data-chip={label}
            className="inline-flex items-center gap-1 whitespace-nowrap text-caption leading-tight text-studio-muted"
          >
            <span aria-hidden className={`font-semibold ${tier.className}`}>
              {tier.icon}
            </span>
            <span className="tabular-nums">{count}</span>
            <span>{tierName(locale, label)}</span>
          </li>
        );
      })}
    </ul>
  );
}

type SummaryProps = {
  report: ReviewReport;
  locale: SiteLocale;
  openingName?: string | null;
  /** Set when the reviewed line is not the main line. */
  lineNote?: string | null;
};

/** Players, opening, accuracy with compact classification chips, and game rating. */
export function ReportSummary({ report, locale, openingName, lineNote }: SummaryProps) {
  const { white, black } = report;
  const hasChips = classificationChips(white).length > 0 || classificationChips(black).length > 0;
  const ratingDescId = useId();
  const [ratingOpen, setRatingOpen] = useState(false);
  return (
    <table className="w-full border-collapse">
      <caption className="sr-only">{tReview(locale, "panel.title")}</caption>
      <thead>
        <tr className={`${ROW} items-start border-b border-studio-border-subtle py-1`}>
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
          <tr className={`${ROW} border-b border-studio-border-subtle`}>
            <td colSpan={3} className="min-w-0 truncate text-caption leading-4 text-studio-muted" title={openingName}>
              {openingName}
            </td>
          </tr>
        ) : null}
        {lineNote ? (
          <tr className={`${ROW} py-0.5`}>
            <td colSpan={3} className="text-caption text-studio-warning-fg">
              {lineNote}
            </td>
          </tr>
        ) : null}
        <tr className={`${ROW} py-0.5`}>
          <th scope="row" className="text-left text-caption font-normal text-studio-faint">
            {tReview(locale, "report.accuracy")}
          </th>
          <td className="text-center text-2xl font-semibold leading-none tabular-nums">{percent(white.accuracy, locale)}</td>
          <td className="text-center text-2xl font-semibold leading-none tabular-nums">{percent(black.accuracy, locale)}</td>
        </tr>
        {hasChips ? (
        <tr className={`${ROW} items-start pb-1`}>
            <th scope="row" className="text-left font-normal">
              <span className="sr-only">{tReview(locale, "report.classifications")}</span>
            </th>
            <td className="min-w-0">
              <ClassificationChips side={white} locale={locale} />
            </td>
            <td className="min-w-0">
              <ClassificationChips side={black} locale={locale} />
            </td>
          </tr>
        ) : null}
        <tr className={`${ROW} border-y border-studio-border-subtle py-0.5`}>
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
          <tr className={`${ROW} border-b border-studio-border-subtle py-2`}>
            <td colSpan={3}>
              <div role="note" id={ratingDescId} className="text-caption leading-relaxed text-studio-muted">
                {tReview(locale, "report.ratingTooltip")}
              </div>
            </td>
          </tr>
        ) : null}
      </tbody>
    </table>
  );
}

/** Collapsed-by-default disclosure: avg. loss, per-phase accuracy and the full classification table. */
export function ReportDetails({ report, locale }: { report: ReviewReport; locale: SiteLocale }) {
  const { white, black } = report;
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const phases = REPORT_PHASES.filter((phase) => white.phases[phase.id] != null || black.phases[phase.id] != null);
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <div className="border-b border-studio-border-subtle">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-1 px-3 py-1.5 text-left text-caption uppercase tracking-wide text-studio-faint hover:text-studio-fg focus-visible:outline-2 focus-visible:outline-studio-accent"
      >
        <Chevron size={14} aria-hidden />
        {tReview(locale, "report.details")}
      </button>
      {open ? (
        <table id={panelId} className="w-full border-collapse">
          <caption className="sr-only">{tReview(locale, "report.details")}</caption>
          <thead className="sr-only">
            <tr>
              <th scope="col">{tReview(locale, "report.details")}</th>
              <th scope="col">{white.name}</th>
              <th scope="col">{black.name}</th>
            </tr>
          </thead>
          <tbody>
            <tr className={`${ROW} py-1 text-dense`}>
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
            {phases.map((phase) => (
              <tr key={phase.id} className={`${ROW} py-1 text-dense`}>
                <th scope="row" className="text-left text-caption font-normal text-studio-faint">
                  {phaseName(locale, phase.id)}
                </th>
                <td className="text-center tabular-nums text-studio-muted">{percent(white.phases[phase.id], locale)}</td>
                <td className="text-center tabular-nums text-studio-muted">{percent(black.phases[phase.id], locale)}</td>
              </tr>
            ))}
            {REVIEW_LABELS.map((label, position) => {
              const tier = REVIEW_TIERS[label];
              return (
                <tr
                  key={label}
                  className={`${ROW} py-1 text-dense ${position === 0 ? "border-t border-studio-border-subtle" : ""}`}
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
            <tr className={`${ROW} py-1 text-dense`}>
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
          </tbody>
        </table>
      ) : null}
    </div>
  );
}

type MomentsProps = {
  moments: KeyMomentRow[];
  moveNotation: MoveNotation;
  locale: SiteLocale;
  onSelectMoment: (path: Path) => void;
  /** Board path, to highlight the active key-moment row. */
  selectedPath?: Path | null;
  /** True when filters hid every moment (shows report.noFilteredMoments). */
  hasUnfilteredMoments?: boolean;
  /** Tree start FEN, used to derive display move numbers via moveNumberForPath. */
  startFen: string;
};

export function KeyMomentsList({
  moments,
  moveNotation,
  locale,
  onSelectMoment,
  selectedPath = null,
  hasUnfilteredMoments = false,
  startFen,
}: MomentsProps) {
  return (
    // The label sits in the same 88px column as the table's row labels, which
    // keeps the first moment right under the rating row (compact dock panel).
    <div role="group" aria-label={tReview(locale, "report.keyMoments")} className="grid grid-cols-[88px_1fr] items-start gap-x-2 pl-3">
      <h3 aria-hidden className="pt-1.5 text-caption font-normal uppercase leading-4 tracking-wide text-studio-faint">
        {tReview(locale, "report.keyMoments")}
      </h3>
      {moments.length === 0 ? (
        <p className="py-1 pr-3 text-dense text-studio-faint">
          {tReview(locale, hasUnfilteredMoments ? "report.noFilteredMoments" : "report.noMistakes")}
        </p>
      ) : (
        <ul className="min-w-0 py-0.5">
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
                  className={`flex w-full items-center gap-2 pr-3 py-0.5 text-left hover:bg-studio-hover${
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
    </div>
  );
}
