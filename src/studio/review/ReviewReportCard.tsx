"use client";

import { formatSan, type MoveNotation } from "@/src/chess/move-notation";
import { REPORT_PHASES, type ReviewReport, type SideReport } from "@/src/chess/review-report";
import { phaseName, reviewPlayerFallback, tierName, tReview } from "@/src/chess/review-strings";
import { REVIEW_TIERS } from "@/src/chess/review-tiers";
import { REVIEW_LABELS, type ReviewLabel } from "@/src/chess/review";
import type { SiteLocale } from "@/src/i18n/locale";
import type { Path } from "@/src/chess/tree";

export type KeyMomentRow = {
  path: Path;
  san: string;
  side: "w" | "b";
  label: ReviewLabel | null;
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
};

/** One decimal, so 86 shows as 86.0 like the other column. */
function percent(value: number | null): string {
  return value == null ? "—" : value.toFixed(1);
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

function ratingText(side: SideReport): string {
  const { value, anchored } = side.gameRating;
  if (value == null) {
    return "—";
  }
  return anchored ? String(value) : `≈ ${value}`;
}

export function ReviewReportCard({ report, moments, moveNotation, locale, onSelectMoment, openingName, lineNote }: Props) {
  const { white, black } = report;
  const ratingTooltip = tReview(locale, "report.ratingTooltip");
  return (
    <>
      <div className="grid grid-cols-[88px_1fr_1fr] items-start gap-2 border-b border-studio-border-subtle px-3 py-2">
        <span />
        <PlayerHeader side={white} color={reviewPlayerFallback(locale, "w")} />
        <PlayerHeader side={black} color={reviewPlayerFallback(locale, "b")} />
      </div>
      {openingName ? (
        <p className="truncate border-b border-studio-border-subtle px-3 py-1 text-caption text-studio-muted" title={openingName}>
          {openingName}
        </p>
      ) : null}
      {lineNote ? <p className="px-3 py-1 text-caption text-studio-warning-fg">{lineNote}</p> : null}
      <div className="grid grid-cols-[88px_1fr_1fr] items-center gap-2 border-b border-studio-border-subtle px-3 py-3">
        <span className="text-caption text-studio-faint">{tReview(locale, "report.accuracy")}</span>
        <span className="text-center text-2xl font-semibold tabular-nums">{percent(white.accuracy)}</span>
        <span className="text-center text-2xl font-semibold tabular-nums">{percent(black.accuracy)}</span>
      </div>
      <div className="grid grid-cols-[88px_1fr_1fr] items-center gap-2 px-3 py-1 text-dense">
        <span className="text-caption text-studio-faint" title={tReview(locale, "report.avgLossTitle")}>
          {tReview(locale, "report.avgLoss")}
        </span>
        <span className="text-center tabular-nums text-studio-muted">{white.acpl ?? "—"}</span>
        <span className="text-center tabular-nums text-studio-muted">{black.acpl ?? "—"}</span>
      </div>
      {REPORT_PHASES.map((phase) => (
        <div key={phase.id} className="grid grid-cols-[88px_1fr_1fr] items-center gap-2 px-3 py-1 text-dense">
          <span className="text-caption text-studio-faint">{phaseName(locale, phase.id)}</span>
          <span className="text-center tabular-nums text-studio-muted">{percent(white.phases[phase.id])}</span>
          <span className="text-center tabular-nums text-studio-muted">{percent(black.phases[phase.id])}</span>
        </div>
      ))}
      <ul className="border-y border-studio-border-subtle py-1">
        {REVIEW_LABELS.map((label) => {
          const tier = REVIEW_TIERS[label];
          return (
            <li key={label} className="grid grid-cols-[88px_1fr_1fr] items-center gap-2 px-3 py-1 text-dense">
              <span className="flex items-center gap-1.5">
                <span aria-hidden className={`w-4 text-center font-semibold ${tier.className}`}>
                  {tier.icon}
                </span>
                <span>{tierName(locale, label)}</span>
              </span>
              <span className="text-center tabular-nums text-studio-muted">{white.counts[label]}</span>
              <span className="text-center tabular-nums text-studio-muted">{black.counts[label]}</span>
            </li>
          );
        })}
        <li className="grid grid-cols-[88px_1fr_1fr] items-center gap-2 px-3 py-1 text-dense">
          <span className="flex items-center gap-1.5" title={tReview(locale, "report.forcedTooltip")}>
            <span aria-hidden className={`w-4 text-center font-semibold ${REVIEW_TIERS.forced.className}`}>
              {REVIEW_TIERS.forced.icon}
            </span>
            <span className="text-studio-muted">{tierName(locale, "forced")}</span>
          </span>
          <span className="text-center tabular-nums text-studio-faint">{white.forced}</span>
          <span className="text-center tabular-nums text-studio-faint">{black.forced}</span>
        </li>
      </ul>
      <div className="grid grid-cols-[88px_1fr_1fr] items-center gap-2 border-b border-studio-border-subtle px-3 py-2">
        <span className="text-caption text-studio-faint" title={ratingTooltip}>
          {tReview(locale, "report.gameRating")}
        </span>
        <span className="text-center text-dense font-semibold tabular-nums" title={ratingTooltip}>
          {ratingText(white)}
        </span>
        <span className="text-center text-dense font-semibold tabular-nums" title={ratingTooltip}>
          {ratingText(black)}
        </span>
      </div>
      <div className="px-3 py-2 text-caption uppercase tracking-wide text-studio-faint">{tReview(locale, "report.keyMoments")}</div>
      {moments.length === 0 ? (
        <p className="px-3 pb-3 text-dense text-studio-faint">{tReview(locale, "report.noMistakes")}</p>
      ) : (
        moments.map((row) => {
          if (!row.label) {
            return null;
          }
          const tier = REVIEW_TIERS[row.label];
          return (
            <button
              key={row.path.join(".")}
              type="button"
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-studio-hover"
              onClick={() => onSelectMoment(row.path)}
            >
              <span className={`w-6 text-center font-semibold ${tier.className}`}>{tier.mark}</span>
              <span className="font-medium">{formatSan(row.san, moveNotation, row.side)}</span>
              <span className="ml-auto text-caption text-studio-faint">{tierName(locale, row.label)}</span>
            </button>
          );
        })
      )}
    </>
  );
}
