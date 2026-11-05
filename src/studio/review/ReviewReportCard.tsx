"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { accountInitials } from "@/src/lib/account-initials";
import { formatSan, type MoveNotation } from "@/src/chess/move-notation";
import { REPORT_PHASES, type ReviewReport, type SideReport } from "@/src/chess/review-report";
import {
  keyMomentAccessibleName,
  phaseName,
  retryButtonLabel,
  reviewPlayerFallback,
  tierJumpLabel,
  tierName,
  tReview,
} from "@/src/chess/review-strings";
import { REVIEW_TIERS } from "@/src/chess/review-tiers";
import { REVIEW_LABELS, type ReviewLabel, type TierLabel } from "@/src/chess/review";
import type { SiteLocale } from "@/src/i18n/locale";
import { formatDecimal1, formatInteger } from "@/src/i18n/format";
import { formatMomentEval, momentBestLabel, momentNumberLabel } from "./key-moment-format";
import { moveNumberForPath, pathsEqual, type Path } from "@/src/chess/tree";
import { RetryButton } from "./RetryCard";
import { TierBadge } from "./TierBadge";

export type KeyMomentRow = {
  path: Path;
  san: string;
  side: "w" | "b";
  label: ReviewLabel | null;
  /** 0-based ply index within the reviewed line (ReviewRow.index). */
  index: number;
  /** Centipawns lost on this move (ReviewRow.lossCp) — drives the "lost X pawns" clause. */
  lossCp: number;
  /** White-perspective eval (pawns) of the best line before the move / of the position after it. */
  beforePawns: number;
  afterPawns: number;
  /** SAN of the engine's first choice from the position before the move; null when it equals the played move. */
  bestSan: string | null;
};

/** One decimal, so 86 shows as 86.0 (en) / 86,0 (pt-br) like the other column. */
function percent(value: number | null, locale: SiteLocale): string {
  return value == null ? "—" : formatDecimal1(locale, value);
}

function PlayerAvatar({ name, side }: { name: string; side: "w" | "b" }) {
  // Fixed piece colours (not theme tokens): the avatar says which side the player had.
  return (
    <span
      aria-hidden
      data-avatar={side}
      className={`grid size-6 shrink-0 place-items-center rounded-full text-caption font-semibold leading-none ring-1 ring-studio-border-strong ${
        side === "w" ? "bg-[#f4f4f5] text-[#18181b]" : "bg-[#2a2b30] text-[#f4f4f5]"
      }`}
    >
      {accountInitials(name, "")}
    </span>
  );
}

function PlayerHeader({ side, color, piece }: { side: SideReport; color: string; piece: "w" | "b" }) {
  return (
    <div className="flex min-w-0 items-center justify-center gap-1.5 leading-tight">
      <PlayerAvatar name={side.name} side={piece} />
      <span className="flex min-w-0 flex-col items-start">
        <span className="max-w-full truncate text-dense font-semibold" title={side.name}>
          {side.name}
        </span>
        <span className="text-caption text-studio-faint">{side.rating != null ? side.rating : color}</span>
      </span>
    </div>
  );
}

/** Thin 0-100 accuracy bar under the big number (decorative; the number carries the value). */
function AccuracyBar({ value }: { value: number | null }) {
  if (value == null) {
    return null;
  }
  return (
    <div aria-hidden data-accuracy-bar className="h-1 w-full max-w-24 overflow-hidden rounded-full bg-studio-track">
      <div className="h-full rounded-full bg-studio-accent" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
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
const SECTION = "border-b border-studio-border-subtle";
const JUMP_BUTTON =
  "rounded-md bg-studio-hover-subtle tabular-nums text-studio-fg hover:bg-studio-hover-strong focus-visible:outline-2 focus-visible:outline-studio-accent";
/** Same box for buttons and plain numbers, so table rows keep one height. */
const COUNT_BOX = "inline-flex min-h-6 min-w-8 items-center justify-center px-1.5";
const COUNT_BOX_DENSE = "inline-flex min-h-5 min-w-5 items-center justify-center px-1";

/** Labels with a non-zero count for one side, in REVIEW_LABELS order. */
export function classificationChips(side: SideReport): Array<{ label: TierLabel; count: number }> {
  return REVIEW_LABELS.flatMap((label) => (side.counts[label] > 0 ? [{ label, count: side.counts[label] }] : []));
}

/** Jumps the board to a move of `label` for one side (first click: the first one, then cycling). */
export type SelectTier = (side: "w" | "b", label: TierLabel) => void;

/** A count that is a button when there is something to jump to, plain text otherwise. */
function TierCount({
  side,
  piece,
  label,
  locale,
  onSelectTier,
  className = "",
  dense = false,
}: {
  side: SideReport;
  piece: "w" | "b";
  label: TierLabel;
  locale: SiteLocale;
  onSelectTier?: SelectTier;
  className?: string;
  dense?: boolean;
}) {
  const count = side.counts[label];
  const box = dense ? COUNT_BOX_DENSE : COUNT_BOX;
  if (count === 0 || !onSelectTier) {
    return <span className={`${box} tabular-nums ${className}`}>{count}</span>;
  }
  return (
    <button
      type="button"
      data-tier-count={label}
      aria-label={tierJumpLabel(locale, { tier: tierName(locale, label), player: side.name, count })}
      onClick={() => onSelectTier(piece, label)}
      className={`${box} ${JUMP_BUTTON} ${className}`}
    >
      {count}
    </button>
  );
}

function ClassificationChips({
  side,
  piece,
  locale,
  onSelectTier,
}: {
  side: SideReport;
  piece: "w" | "b";
  locale: SiteLocale;
  onSelectTier?: SelectTier;
}) {
  const chips = classificationChips(side);
  if (chips.length === 0) {
    return null;
  }
  return (
    <ul className="flex flex-wrap justify-center gap-x-2 gap-y-0.5">
      {chips.map(({ label }) => {
        return (
          <li
            key={label}
            data-chip={label}
            className="inline-flex items-center gap-0.5 whitespace-nowrap text-caption leading-tight text-studio-muted"
          >
            <TierBadge label={label} size={14} />
            <TierCount side={side} piece={piece} label={label} locale={locale} onSelectTier={onSelectTier} className="text-studio-fg" dense />
            <span>{tierName(locale, label)}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** Section 2: the full two-column table (zero counts faint), or the compact chips in a narrow panel. */
function ClassificationSection({
  report,
  locale,
  compact,
  onSelectTier,
}: {
  report: ReviewReport;
  locale: SiteLocale;
  compact: boolean;
  onSelectTier?: SelectTier;
}) {
  const { white, black } = report;
  if (compact) {
    if (classificationChips(white).length === 0 && classificationChips(black).length === 0) {
      return null;
    }
    return (
      <div data-classification="chips" role="group" aria-label={tReview(locale, "report.classifications")} className={`grid grid-cols-2 items-start gap-2 px-3 py-1 ${SECTION}`}>
        <div className="min-w-0">
          <ClassificationChips side={white} piece="w" locale={locale} onSelectTier={onSelectTier} />
        </div>
        <div className="min-w-0">
          <ClassificationChips side={black} piece="b" locale={locale} onSelectTier={onSelectTier} />
        </div>
      </div>
    );
  }
  return (
    <table data-classification="table" className={`w-full border-collapse ${SECTION}`}>
      <caption className="sr-only">{tReview(locale, "report.classifications")}</caption>
      <thead className="sr-only">
        <tr>
          <th scope="col">{tReview(locale, "report.classifications")}</th>
          <th scope="col">{white.name}</th>
          <th scope="col">{black.name}</th>
        </tr>
      </thead>
      <tbody>
        {REVIEW_LABELS.map((label) => {
          const zero = white.counts[label] === 0 && black.counts[label] === 0;
          return (
            <tr key={label} data-tier-row={label} className={`${ROW} py-px text-dense`}>
              <th scope="row" className="flex items-center gap-1.5 text-left font-normal">
                <span className={zero ? "opacity-45" : undefined}>
                  <TierBadge label={label} size={16} />
                </span>
                <span className={zero ? "text-studio-faint" : "text-studio-fg-secondary"}>{tierName(locale, label)}</span>
              </th>
              {([[white, "w"], [black, "b"]] as const).map(([side, piece]) => (
                <td key={piece} className="text-center">
                  <TierCount
                    side={side}
                    piece={piece}
                    label={label}
                    locale={locale}
                    onSelectTier={onSelectTier}
                    className={side.counts[label] === 0 ? "text-studio-faint" : "font-semibold text-studio-fg"}
                  />
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** One value + bar of the phase section; a side that never reached the phase shows a dash. */
function PhaseBar({ value, locale }: { value: number | null; locale: SiteLocale }) {
  if (value == null) {
    return <span className="block text-center text-dense text-studio-faint">—</span>;
  }
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-center text-dense font-semibold tabular-nums">{percent(value, locale)}</span>
      <div aria-hidden data-phase-bar className="h-1.5 overflow-hidden rounded-full bg-studio-track">
        <div className="h-full rounded-full bg-studio-accent" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}

/** Section 4: accuracy per phase, white and black side by side. Phases neither side reached are left out. */
function PhasesSection({ report, locale }: { report: ReviewReport; locale: SiteLocale }) {
  const { white, black } = report;
  const phases = REPORT_PHASES.filter((phase) => white.phases[phase.id] != null || black.phases[phase.id] != null);
  if (phases.length === 0) {
    return null;
  }
  return (
    <table data-report-section="phases" className={`w-full border-collapse ${SECTION}`}>
      <caption className="sr-only">{tReview(locale, "report.phases")}</caption>
      <thead className="sr-only">
        <tr>
          <th scope="col">{tReview(locale, "report.phases")}</th>
          <th scope="col">{white.name}</th>
          <th scope="col">{black.name}</th>
        </tr>
      </thead>
      <tbody>
        {phases.map((phase) => {
          const name = phaseName(locale, phase.id);
          return (
            <tr key={phase.id} data-phase={phase.id} className={`${ROW} py-1`}>
              <th scope="row" className="text-left text-caption font-normal text-studio-faint">
                {name}
              </th>
              {([[white, "w"], [black, "b"]] as const).map(([side, piece]) => (
                <td key={piece}>
                  <PhaseBar value={side.phases[phase.id]} locale={locale} />
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

type SummaryProps = {
  report: ReviewReport;
  locale: SiteLocale;
  openingName?: string | null;
  /** Set when the reviewed line is not the main line. */
  lineNote?: string | null;
  /** SIG-1207: one-line verdict for both players (null while only a partial preview exists). */
  verdict?: string | null;
  /** SIG-1219: narrow panel: the classification falls back to compact chips. */
  compact?: boolean;
  /** SIG-1219: makes the counts buttons that jump to a move of that tier. */
  onSelectTier?: SelectTier;
};

/**
 * The report card, top to bottom: header (players, accuracy, game rating),
 * classification, [time slot], phases. Key moments follow in KeyMomentsList.
 */
export function ReportSummary({ report, locale, openingName, lineNote, verdict, compact = false, onSelectTier }: SummaryProps) {
  const { white, black } = report;
  const ratingDescId = useId();
  const [ratingOpen, setRatingOpen] = useState(false);
  return (
    <div data-report-card data-compact={compact ? "" : undefined}>
      {/* Section 1: header. */}
      <table data-report-section="header" className={`w-full border-collapse ${SECTION}`}>
        <caption className="sr-only">{tReview(locale, "panel.title")}</caption>
        <thead>
          <tr className={`${ROW} items-start border-b border-studio-border-subtle py-1`}>
            <th scope="col" className="font-normal">
              <span className="sr-only">{tReview(locale, "report.accuracy")}</span>
            </th>
            <th scope="col" className="min-w-0 font-normal">
              <PlayerHeader side={white} color={reviewPlayerFallback(locale, "w")} piece="w" />
            </th>
            <th scope="col" className="min-w-0 font-normal">
              <PlayerHeader side={black} color={reviewPlayerFallback(locale, "b")} piece="b" />
            </th>
          </tr>
        </thead>
        <tbody>
          {openingName ? (
            <tr className={`${ROW} border-b border-studio-border-subtle`}>
              <td colSpan={3} className="min-w-0 truncate text-caption leading-[14px] text-studio-muted" title={openingName}>
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
          <tr className={`${ROW} pt-1`}>
            <th scope="row" className="text-left text-caption font-normal text-studio-faint">
              {tReview(locale, "report.accuracy")}
            </th>
            {([[white, "w"], [black, "b"]] as const).map(([side, piece]) => (
              <td key={piece}>
                <div className="flex flex-col items-center gap-1">
                  <span className="text-[28px] font-semibold leading-none tabular-nums">{percent(side.accuracy, locale)}</span>
                  <AccuracyBar value={side.accuracy} />
                </div>
              </td>
            ))}
          </tr>
          {verdict ? (
            <tr data-verdict className={ROW}>
              <td colSpan={3} className="col-span-3 pb-0.5 pt-1 text-center text-caption leading-[14px] text-studio-fg-secondary">
                {verdict}
              </td>
            </tr>
          ) : null}
          <tr className={`${ROW} border-t border-studio-border-subtle`}>
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
            <td className="py-1 text-center text-dense font-semibold tabular-nums">{ratingText(white, locale)}</td>
            <td className="py-1 text-center text-dense font-semibold tabular-nums">{ratingText(black, locale)}</td>
          </tr>
          {ratingOpen ? (
            <tr className={`${ROW} border-t border-studio-border-subtle py-2`}>
              <td colSpan={3}>
                <div role="note" id={ratingDescId} className="text-caption leading-relaxed text-studio-muted">
                  {tReview(locale, "report.ratingTooltip")}
                </div>
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
      {/* Section 2: classification. */}
      <ClassificationSection report={report} locale={locale} compact={compact} onSelectTier={onSelectTier} />
      {/* Section 3: TIME. Reserved insertion point for Game Review 2 · 3/5, which
          renders the clock section here (hidden when the game has no clocks).
          Intentionally renders nothing in this PR. */}
      {/* Section 4: phases. */}
      <PhasesSection report={report} locale={locale} />
    </div>
  );
}

/** Collapsed-by-default disclosure: average loss and the Forced count (everything else is always visible in the card). */
export function ReportDetails({ report, locale }: { report: ReviewReport; locale: SiteLocale }) {
  const { white, black } = report;
  const [open, setOpen] = useState(false);
  const panelId = useId();
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
            <tr className={`${ROW} py-1 text-dense`}>
              <th scope="row" className="flex items-center gap-1.5 text-left font-normal">
                <span title={tReview(locale, "report.forcedTooltip")} className="flex items-center gap-1.5">
                  <TierBadge label="forced" size={16} />
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
  /** SIG-1208: the "Why?" body for the active row, rendered inline under it (never exported to the PNG). */
  explanation?: ReactNode;
  /** SIG-1209: starts a retry of the mistake at `path`; only rows in `retryPaths` get the button. */
  onRetry?: (path: Path) => void;
  /** `path.join(".")` of every retryable moment. */
  retryPaths?: ReadonlySet<string>;
  /** A retry is open: "best: …" is hidden on every row and the Why? stays collapsed. */
  retryActive?: boolean;
};

export function KeyMomentsList({
  moments,
  moveNotation,
  locale,
  onSelectMoment,
  selectedPath = null,
  hasUnfilteredMoments = false,
  startFen,
  explanation = null,
  onRetry,
  retryPaths,
  retryActive = false,
}: MomentsProps) {
  // Clicking the active row collapses its explanation; the flag belongs to one
  // row and resets as soon as the board moves to another path.
  const [collapsedKey, setCollapsedKey] = useState<string | null>(null);
  const selectedKey = selectedPath ? selectedPath.join(".") : null;
  if (collapsedKey != null && collapsedKey !== selectedKey) {
    setCollapsedKey(null);
  }
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
            const key = row.path.join(".");
            const bestLabel = retryActive ? null : momentBestLabel(locale, moveNotation, row.side, row.bestSan);
            const open = !retryActive && active && explanation != null && collapsedKey !== key;
            const canRetry = onRetry != null && retryPaths?.has(key) === true;
            const sanText = formatSan(row.san, moveNotation, row.side);
            return (
              <li key={key} className="flex flex-wrap items-center">
                {/* SIG-1209: the Retry button is a sibling of the row button (not
                    nested), so clicking it never navigates and the row's
                    "best:" text can still truncate. */}
                <button
                  type="button"
                  aria-current={active ? "true" : undefined}
                  aria-expanded={!retryActive && active && explanation != null ? open : undefined}
                  aria-label={accessibleName}
                  title={bestLabel ? `${sanText} · ${bestLabel}` : undefined}
                  className={`flex min-w-0 flex-1 items-center gap-2 whitespace-nowrap py-0.5 text-left hover:bg-studio-hover ${
                    canRetry ? "pr-1" : "pr-3"
                  }${active ? " bg-studio-hover-strong" : ""}`}
                  onClick={() => (active ? setCollapsedKey(open ? key : null) : onSelectMoment(row.path))}
                >
                  <span aria-hidden className={`w-6 shrink-0 text-center font-semibold ${tier.className}`}>
                    {tier.mark}
                  </span>
                  <span aria-hidden className="shrink-0 font-medium">
                    <span className="mr-0.5 text-studio-faint">{momentNumberLabel(moveNumber, row.side)}</span>
                    {sanText}
                  </span>
                  <span aria-hidden className="shrink-0 text-caption tabular-nums text-studio-muted">
                    {formatMomentEval(locale, row.beforePawns)} → {formatMomentEval(locale, row.afterPawns)}
                  </span>
                  {bestLabel ? (
                    <span aria-hidden className="ml-auto min-w-0 truncate text-caption text-studio-faint">
                      {bestLabel}
                    </span>
                  ) : null}
                </button>
                {canRetry ? (
                  <span className="mr-3 flex shrink-0">
                    <RetryButton
                      locale={locale}
                      label={retryButtonLabel(locale, moveNotation, { moveNumber, san: row.san, side: row.side })}
                      onClick={() => onRetry(row.path)}
                    />
                  </span>
                ) : null}
                {open ? (
                  <div
                    data-export-ignore
                    role="region"
                    aria-label={tReview(locale, "moments.whyRegion")}
                    className="w-full border-l-2 border-studio-border-subtle pb-1 pl-2"
                  >
                    {explanation}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
