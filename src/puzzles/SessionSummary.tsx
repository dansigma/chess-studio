"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ArrowRight, Check, ChevronLeft, ChevronRight, Crown, Flame, Microscope, X } from "lucide-react";
import { formatDuration, formatInteger } from "@/src/i18n/format";
import type { SiteLocale } from "@/src/i18n/locale";
import { tPuzzle, tPuzzleCount } from "@/src/i18n/puzzle-strings";
import { Button } from "@/src/studio/ui/Button";
import { SUMMARY_LIST_LIMIT, visibleRows, type SessionSummary as Summary } from "./session-summary";
import type { StudioPuzzle } from "./studio-handoff";
import { xpBreakdownText } from "./XpBreakdown";

/** True when the user asked the OS for less motion; animations then start at their end state. */
function prefersReducedMotion(): boolean {
  return typeof globalThis.matchMedia === "function"
    ? globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;
}

/**
 * False for one frame, then true, so a CSS transition has something to run
 * from. With reduced motion it is true from the first render: no animation.
 */
function useEntered(): boolean {
  const [entered, setEntered] = useState(prefersReducedMotion);
  useEffect(() => {
    if (entered) {
      return;
    }
    const frame = window.requestAnimationFrame(() => setEntered(true));
    return () => window.cancelAnimationFrame(frame);
  }, [entered]);
  return entered;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-studio-hover px-3 py-2">
      <dt className="text-caption text-studio-muted">{label}</dt>
      <dd className="mt-0.5 text-title font-semibold tabular-nums text-studio-fg">{value}</dd>
    </div>
  );
}

/**
 * SIG-1245: the session's puzzles, one compact row each: result, that puzzle's
 * XP breakdown (the level card keeps the session total) and "Analyze in
 * Studio". Shows the last SUMMARY_LIST_LIMIT, with a toggle for the rest.
 */
function PuzzleList({
  summary,
  locale,
  onAnalyze,
}: {
  summary: Summary;
  locale: SiteLocale;
  onAnalyze?: (puzzle: StudioPuzzle) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  if (summary.rows.length === 0) {
    return null;
  }
  const rows = visibleRows(summary.rows, showAll);
  const hidden = summary.rows.length > SUMMARY_LIST_LIMIT;
  return (
    <div data-testid="summary-puzzles">
      <h4 className="mb-1.5 text-caption font-semibold text-studio-muted">
        {tPuzzle(locale, "puzzle.summary.list.title")}
      </h4>
      <ul className="space-y-1.5">
        {rows.map((row) => {
          const practice = tPuzzle(locale, "puzzle.summary.list.practice");
          const xpText = summary.level.practiceOnly
            ? practice
            : row.practiceOnly
              ? `${xpBreakdownText(locale, row.breakdown)} · ${practice}`
              : xpBreakdownText(locale, row.breakdown);
          return (
            <li
              key={row.number}
              className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-studio-hover px-2.5 py-1.5"
              data-testid="summary-puzzle-row"
            >
              <span
                role="img"
                aria-label={tPuzzle(
                  locale,
                  row.success ? "puzzle.summary.list.resultSolved" : "puzzle.summary.list.resultFailed",
                )}
                className={row.success ? "text-studio-success" : "text-studio-warning-fg"}
              >
                {row.success ? <Check className="size-4" aria-hidden /> : <X className="size-4" aria-hidden />}
              </span>
              <span className="text-caption tabular-nums text-studio-muted">{formatInteger(locale, row.number)}</span>
              <span className="min-w-0 flex-1 basis-40 text-caption tabular-nums text-studio-fg" data-testid="summary-puzzle-xp">
                {xpText}
              </span>
              {onAnalyze ? (
                <button
                  type="button"
                  onClick={() => onAnalyze(row.puzzle)}
                  aria-label={tPuzzle(locale, "puzzle.summary.list.analyzeAria", { number: row.number })}
                  className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-caption text-studio-accent-text hover:bg-studio-hover-strong"
                >
                  <Microscope className="size-3.5" aria-hidden />
                  {tPuzzle(locale, "puzzle.studio.analyze")}
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
      {hidden ? (
        <button
          type="button"
          aria-expanded={showAll}
          onClick={() => setShowAll((value) => !value)}
          className="mt-1.5 text-caption text-studio-accent-text hover:underline"
        >
          {showAll
            ? tPuzzle(locale, "puzzle.summary.list.showLess", { count: SUMMARY_LIST_LIMIT })
            : tPuzzle(locale, "puzzle.summary.list.showAll", { count: formatInteger(locale, summary.rows.length) })}
        </button>
      ) : null}
    </div>
  );
}

function DidCard({
  summary,
  locale,
  onAnalyze,
}: {
  summary: Summary;
  locale: SiteLocale;
  onAnalyze?: (puzzle: StudioPuzzle) => void;
}) {
  const best = summary.bestLine;
  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-2 gap-2">
        <Stat label={tPuzzle(locale, "puzzle.summary.did.time")} value={formatDuration(locale, summary.trainingMs)} />
        <Stat
          label={tPuzzleCount(locale, "puzzle.summary.did.solved", summary.solved)}
          value={formatInteger(locale, summary.solved)}
        />
        <Stat
          label={tPuzzleCount(locale, "puzzle.summary.did.firstTry", summary.firstTry)}
          value={formatInteger(locale, summary.firstTry)}
        />
        <Stat
          label={tPuzzleCount(locale, "puzzle.summary.did.failed", summary.failed)}
          value={formatInteger(locale, summary.failed)}
        />
      </dl>
      {best ? (
        <p className="text-caption tabular-nums text-studio-muted">
          {best.kind === "rush"
            ? tPuzzle(locale, "puzzle.panel.bestScore", { value: formatInteger(locale, best.best) })
            : tPuzzle(locale, "puzzle.panel.streakSummary", { solved: best.solved, best: best.best })}
        </p>
      ) : null}
      {summary.dayStreak !== null ? (
        <p
          className="inline-flex items-center gap-1.5 rounded-full bg-studio-warning-bg px-3 py-1 text-body font-semibold text-studio-warning-fg"
          aria-label={tPuzzle(locale, "puzzle.summary.dayStreakAria", { count: summary.dayStreak })}
          data-testid="summary-day-streak"
        >
          <Flame className="size-4" aria-hidden />
          {tPuzzle(locale, "puzzle.summary.dayStreak", { count: formatInteger(locale, summary.dayStreak) })}
        </p>
      ) : null}
      <p className="text-body text-studio-fg" data-testid="summary-cheer">
        {tPuzzle(locale, summary.cheerKey)}
      </p>
      <PuzzleList summary={summary} locale={locale} onAnalyze={onAnalyze} />
    </div>
  );
}

function LevelCard({ summary, locale }: { summary: Summary; locale: SiteLocale }) {
  const { level } = summary;
  const entered = useEntered();
  const after = level.after;
  const endPercent = (after.into / after.span) * 100;
  // After a level-up the bar shows the new level filling from empty; otherwise
  // it fills from where the session started.
  const startPercent = level.levelUp ? 0 : (level.before.into / level.before.span) * 100;
  return (
    <div className="space-y-3">
      <p className="text-3xl font-semibold tabular-nums leading-none text-studio-success" data-testid="summary-xp">
        {level.practiceOnly
          ? tPuzzle(locale, "puzzle.xp.practice")
          : tPuzzle(locale, "puzzle.xp.total", { total: formatInteger(locale, level.xpEarned) })}
      </p>
      {level.levelUp ? (
        <p
          className={`flex items-center gap-2 rounded-lg bg-studio-warning-bg px-3 py-2 text-body font-semibold text-studio-warning-fg transition duration-500 ${
            entered ? "scale-100 opacity-100" : "scale-90 opacity-0"
          }`}
          data-testid="summary-level-up"
        >
          <Crown className="size-4" aria-hidden />
          <span>{tPuzzle(locale, "puzzle.summary.level.up")}</span>
          <span className="tabular-nums">
            {tPuzzle(locale, "puzzle.summary.level.change", { from: level.before.level, to: after.level })}
          </span>
        </p>
      ) : null}
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1 text-caption tabular-nums text-studio-muted">
          <Crown className="size-3 text-studio-warning-fg" aria-hidden />
          {after.level}
        </span>
        <div
          role="progressbar"
          aria-label={tPuzzle(locale, "puzzle.level.progressAria", {
            level: after.level,
            into: formatInteger(locale, after.into),
            span: formatInteger(locale, after.span),
          })}
          aria-valuemin={0}
          aria-valuemax={after.span}
          aria-valuenow={after.into}
          className="h-2 flex-1 overflow-hidden rounded-full bg-studio-bg"
        >
          <div
            className="h-full rounded-full bg-studio-success transition-[width] duration-700 ease-out"
            style={{ width: `${entered ? endPercent : startPercent}%` }}
          />
        </div>
        <span className="inline-flex items-center gap-1 text-caption tabular-nums text-studio-muted">
          <Crown className="size-3 text-studio-warning-fg" aria-hidden />
          {after.level + 1}
        </span>
      </div>
      <p className="text-caption tabular-nums text-studio-muted">
        {tPuzzle(locale, "puzzle.level.toNext", {
          xp: formatInteger(locale, after.toNext),
          level: after.level + 1,
        })}
      </p>
    </div>
  );
}

function RatingCard({ summary, locale }: { summary: Summary; locale: SiteLocale }) {
  const rating = summary.rating;
  const entered = useEntered();
  if (!rating) {
    return null;
  }
  const solvedPercent = summary.attempts > 0 ? (summary.solved / summary.attempts) * 100 : 0;
  const failedPercent = summary.attempts > 0 ? 100 - solvedPercent : 0;
  const change = rating.change > 0 ? `+${rating.change}` : String(rating.change);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 tabular-nums">
        <div>
          <p className="text-caption text-studio-muted">{tPuzzle(locale, "puzzle.summary.rating.before")}</p>
          <p className="text-title font-semibold text-studio-fg">{formatInteger(locale, rating.before)}</p>
        </div>
        <ArrowRight className="size-4 text-studio-muted" aria-hidden />
        <div>
          <p className="text-caption text-studio-muted">{tPuzzle(locale, "puzzle.summary.rating.after")}</p>
          <p className="text-title font-semibold text-studio-fg">{formatInteger(locale, rating.after)}</p>
        </div>
        <div className="ml-auto text-right">
          <p className="text-caption text-studio-muted">{tPuzzle(locale, "puzzle.summary.rating.change")}</p>
          <p
            className={`text-title font-semibold ${
              rating.change > 0
                ? "text-studio-success"
                : rating.change < 0
                  ? "text-studio-warning-fg"
                  : "text-studio-fg"
            }`}
            data-testid="summary-rating-change"
          >
            {change}
          </p>
        </div>
      </div>
      <div
        role="img"
        aria-label={tPuzzle(locale, "puzzle.summary.rating.barAria", {
          solved: tPuzzleCount(locale, "puzzle.summary.count.solved", summary.solved),
          failed: tPuzzleCount(locale, "puzzle.summary.count.failed", summary.failed),
        })}
        className="flex h-2 overflow-hidden rounded-full bg-studio-bg"
      >
        <div
          className="h-full bg-studio-success transition-[width] duration-700 ease-out"
          style={{ width: `${entered ? solvedPercent : 0}%` }}
        />
        <div
          className="h-full bg-studio-warning-fg transition-[width] duration-700 ease-out"
          style={{ width: `${entered ? failedPercent : 0}%` }}
        />
      </div>
      <dl className="grid grid-cols-2 gap-2">
        <Stat
          label={tPuzzle(locale, "puzzle.summary.rating.accuracy")}
          value={summary.accuracy === null ? "–" : `${formatInteger(locale, summary.accuracy)}%`}
        />
        <Stat
          label={tPuzzle(locale, "puzzle.summary.rating.avgTime")}
          value={summary.avgMs === null ? "–" : formatDuration(locale, summary.avgMs)}
        />
      </dl>
    </div>
  );
}

const CARD_TITLE_KEYS = {
  did: "puzzle.summary.did.title",
  level: "puzzle.summary.level.title",
  rating: "puzzle.summary.rating.title",
} as const;

/**
 * SIG-1235: the end-of-session summary. A short stepper of 2 or 3 cards (Next /
 * Back, arrow keys) that replaces the trainer panel; the board stays visible.
 * Focus moves to the summary when it appears and to each card's heading as
 * the user steps, so a screen reader announces where they are.
 */
export function SessionSummary({
  summary,
  locale,
  onTrainAgain,
  trainAgainHref,
  canReview,
  onAnalyze,
}: {
  summary: Summary;
  locale: SiteLocale;
  /** Restart the same mode in place. */
  onTrainAgain?: () => void;
  /** Alternative to onTrainAgain for modes that cannot replay (daily). */
  trainAgainHref?: string;
  /** True when there were failures and mistake exercises exist to review. */
  canReview: boolean;
  /** Opens a listed puzzle in the Studio (the panel passes openPuzzleInStudio). */
  onAnalyze?: (puzzle: StudioPuzzle) => void;
}) {
  const [index, setIndex] = useState(0);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const cardRef = useRef<HTMLHeadingElement>(null);
  const stepped = useRef(false);
  const last = summary.cards.length - 1;
  const card = summary.cards[index] ?? summary.cards[0];

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  useEffect(() => {
    if (stepped.current) {
      cardRef.current?.focus();
    }
  }, [index]);

  function go(next: number) {
    if (next < 0 || next > last) {
      return;
    }
    stepped.current = true;
    setIndex(next);
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      go(index + 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      go(index - 1);
    }
  }

  const actionClass = "inline-flex h-8 w-full items-center justify-center rounded-lg px-3 text-body";

  return (
    <section
      role="region"
      aria-labelledby="session-summary-title"
      onKeyDown={onKeyDown}
      data-testid="session-summary"
      className="flex max-h-[min(60dvh,520px)] min-h-64 flex-col overflow-hidden rounded-xl border border-studio-border bg-studio-chrome lg:h-full lg:max-h-none lg:min-h-0"
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <h2
          id="session-summary-title"
          ref={titleRef}
          tabIndex={-1}
          className="text-body font-semibold text-studio-fg outline-none"
        >
          {tPuzzle(locale, "puzzle.summary.title")}
        </h2>
        <p className="text-caption tabular-nums text-studio-muted" data-testid="summary-step">
          {tPuzzle(locale, "puzzle.summary.step", { current: index + 1, total: summary.cards.length })}
        </p>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-4">
        <h3
          ref={cardRef}
          tabIndex={-1}
          className="text-title font-semibold text-studio-fg outline-none"
          data-testid="summary-card-title"
        >
          {tPuzzle(locale, CARD_TITLE_KEYS[card])}
        </h3>
        {card === "did" ? <DidCard summary={summary} locale={locale} onAnalyze={onAnalyze} /> : null}
        {card === "level" ? <LevelCard summary={summary} locale={locale} /> : null}
        {card === "rating" ? <RatingCard summary={summary} locale={locale} /> : null}
      </div>

      <div className="flex flex-col gap-2 border-t border-studio-border p-3">
        {index === last ? (
          <>
            {trainAgainHref ? (
              <Link
                href={trainAgainHref}
                className={`${actionClass} bg-studio-accent font-medium text-studio-accent-fg hover:bg-studio-accent-strong`}
              >
                {tPuzzle(locale, "puzzle.summary.action.trainAgain")}
              </Link>
            ) : (
              <Button variant="primary" className="w-full" onClick={onTrainAgain}>
                {tPuzzle(locale, "puzzle.summary.action.trainAgain")}
              </Button>
            )}
            {canReview ? (
              <Link
                href="/puzzles/play?mode=mistakes"
                className={`${actionClass} bg-studio-hover-strong text-studio-fg hover:bg-studio-selected`}
              >
                {tPuzzle(locale, "puzzle.summary.action.review")}
              </Link>
            ) : null}
            <Link
              href="/puzzles"
              className={`${actionClass} text-studio-muted hover:bg-studio-hover hover:text-studio-fg`}
            >
              {tPuzzle(locale, "puzzle.panel.backToPuzzles")}
            </Link>
          </>
        ) : null}
        <div className="flex items-center justify-between gap-2">
          {index > 0 ? (
            <Button variant="ghost" onClick={() => go(index - 1)}>
              <ChevronLeft className="size-4" aria-hidden />
              {tPuzzle(locale, "puzzle.summary.back")}
            </Button>
          ) : (
            <span />
          )}
          {index < last ? (
            <Button variant="primary" onClick={() => go(index + 1)}>
              {tPuzzle(locale, "puzzle.summary.next")}
              <ChevronRight className="size-4" aria-hidden />
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
