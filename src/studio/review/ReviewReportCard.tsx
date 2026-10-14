"use client";

import { formatSan } from "@/src/chess/move-notation";
import { REPORT_PHASES, type ReviewReport, type SideReport } from "@/src/chess/review-report";
import { REVIEW_TIERS } from "@/src/chess/review-tiers";
import { REVIEW_LABELS, type ReviewLabel } from "@/src/chess/review";
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
  moveNotation: Parameters<typeof formatSan>[1];
  onSelectMoment: (path: Path) => void;
  openingName?: string | null;
  /** Set when the reviewed line is not the main line. */
  lineNote?: string | null;
};

const RATING_TOOLTIP =
  "Estimated from your average centipawn loss (book and forced moves excluded). " +
  "When the game header has a rating, the estimate is scaled around it. It is an estimate, not an official rating.";

function PlayerHeader({ side, color }: { side: SideReport; color: "White" | "Black" }) {
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
  return side.gameRating.value != null ? String(side.gameRating.value) : "—";
}

export function ReviewReportCard({ report, moments, moveNotation, onSelectMoment, openingName, lineNote }: Props) {
  const { white, black } = report;
  return (
    <>
      <div className="grid grid-cols-[88px_1fr_1fr] items-start gap-2 border-b border-studio-border-subtle px-3 py-2">
        <span />
        <PlayerHeader side={white} color="White" />
        <PlayerHeader side={black} color="Black" />
      </div>
      {openingName ? (
        <p className="truncate border-b border-studio-border-subtle px-3 py-1 text-caption text-studio-muted" title={openingName}>
          {openingName}
        </p>
      ) : null}
      {lineNote ? <p className="px-3 py-1 text-caption text-studio-warning-fg">{lineNote}</p> : null}
      <div className="grid grid-cols-[88px_1fr_1fr] items-center gap-2 border-b border-studio-border-subtle px-3 py-3">
        <span className="text-caption text-studio-faint">Accuracy</span>
        <span className="text-center text-2xl font-semibold tabular-nums">{white.accuracy ?? "—"}</span>
        <span className="text-center text-2xl font-semibold tabular-nums">{black.accuracy ?? "—"}</span>
      </div>
      {REPORT_PHASES.map((phase) => (
        <div key={phase.id} className="grid grid-cols-[88px_1fr_1fr] items-center gap-2 px-3 py-1 text-dense">
          <span className="text-caption text-studio-faint">{phase.name}</span>
          <span className="text-center tabular-nums text-studio-muted">{white.phases[phase.id] ?? "—"}</span>
          <span className="text-center tabular-nums text-studio-muted">{black.phases[phase.id] ?? "—"}</span>
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
                <span>{tier.name}</span>
              </span>
              <span className="text-center tabular-nums text-studio-muted">{white.counts[label]}</span>
              <span className="text-center tabular-nums text-studio-muted">{black.counts[label]}</span>
            </li>
          );
        })}
      </ul>
      <div className="grid grid-cols-[88px_1fr_1fr] items-center gap-2 border-b border-studio-border-subtle px-3 py-2">
        <span className="text-caption text-studio-faint" title={RATING_TOOLTIP}>
          Game rating ⓘ
        </span>
        <span className="text-center text-dense font-semibold tabular-nums" title={RATING_TOOLTIP}>
          {ratingText(white)}
        </span>
        <span className="text-center text-dense font-semibold tabular-nums" title={RATING_TOOLTIP}>
          {ratingText(black)}
        </span>
      </div>
      <div className="px-3 py-2 text-caption uppercase tracking-wide text-studio-faint">Key moments</div>
      {moments.length === 0 ? (
        <p className="px-3 pb-3 text-dense text-studio-faint">No mistakes in this line.</p>
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
              <span className="ml-auto text-caption text-studio-faint">{tier.name}</span>
            </button>
          );
        })
      )}
    </>
  );
}
