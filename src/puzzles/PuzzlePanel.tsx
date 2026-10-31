"use client";

import Link from "next/link";
import { Check, ChevronRight, Crown, Flame, X } from "lucide-react";
import type { SiteLocale } from "@/src/i18n/locale";
import { formatInteger } from "@/src/i18n/format";
import { tPuzzle } from "@/src/i18n/puzzle-strings";
import { Button } from "@/src/studio/ui/Button";
import { THEME_LABEL_KEYS, type PuzzleMode, type PuzzleTheme } from "./types";
import { RUSH_STRIKES, clock, type PuzzleSession } from "./use-puzzle-session";
import type { PuzzleFeedback } from "./use-puzzle-feedback";

export function PuzzlePanel({
  mode,
  theme,
  session,
  feedback,
  locale,
}: {
  mode: PuzzleMode;
  theme: PuzzleTheme | null;
  session: PuzzleSession;
  feedback: PuzzleFeedback;
  locale: SiteLocale;
}) {
  const {
    puzzle,
    status,
    sessionSolved,
    strikes,
    sessionOver,
    secondsLeft,
    exhausted,
    progress,
    delta,
    gained,
    hintLevel,
    setHintLevel,
    giveUp,
    nextPuzzle,
    retry,
    miss,
    reveal,
    userTurn,
  } = session;
  const { level, modeLabel, continueLabel, bubbleTitle, bubbleBody, solverMoves, solverIndex, runStreak } = feedback;

  if (!puzzle || !progress) {
    return null;
  }

  return (
    <section className="flex max-h-[min(48dvh,420px)] min-h-40 flex-col overflow-hidden rounded-xl border border-studio-border bg-studio-chrome lg:max-h-[calc(100dvh-8rem)] lg:min-h-0">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <h1 className="flex items-center gap-2 text-body font-semibold text-studio-fg">
          <span className="inline-flex items-center gap-1 rounded-full bg-studio-hover px-2 py-0.5 tabular-nums">
            <Crown className="size-3.5 text-studio-warning-fg" aria-hidden />
            {level.level}
          </span>
          {modeLabel}
          {theme ? ` · ${tPuzzle(locale, THEME_LABEL_KEYS[theme])}` : ""}
        </h1>
        {mode === "rush" ? (
          <span
            className={`text-title font-semibold tabular-nums ${
              secondsLeft <= 30 ? "text-red-400" : "text-studio-fg"
            }`}
          >
            {clock(secondsLeft)}
          </span>
        ) : (
          <span className="text-caption tabular-nums text-studio-muted">
            {tPuzzle(locale, "puzzle.panel.puzzleRating", { rating: formatInteger(locale, puzzle.rating) })}
          </span>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-4" aria-live="polite">
        <div className="rounded-xl bg-studio-hover px-4 py-3">
          <p className="text-body font-semibold text-studio-fg">{bubbleTitle}</p>
          <p className="mt-1 text-body text-studio-muted">{bubbleBody}</p>
          {solverMoves > 1 && status === "playing" && !sessionOver ? (
            <p className="mt-1 text-caption text-studio-muted">
              {tPuzzle(locale, "puzzle.panel.moveCounter", {
                current: Math.min(solverIndex, solverMoves),
                total: solverMoves,
              })}
            </p>
          ) : null}
          {sessionOver && mode === "rush" && reveal && miss ? (
            <p className="mt-1 text-caption text-studio-muted">
              {tPuzzle(locale, "puzzle.panel.bestMove", { san: miss.san })}
            </p>
          ) : null}
        </div>

        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-3xl font-semibold tabular-nums leading-none text-studio-fg">
              {/* SIG-1097: mistakes shows solved-in-session, never XP. */}
              {mode === "rush" ? sessionSolved : mode === "mistakes" ? sessionSolved : progress.xp}
              {mode !== "rush" && mode !== "mistakes" && status === "solved" && gained > 0 ? (
                <span className="ml-2 text-title text-studio-success">+{gained}</span>
              ) : null}
            </p>
            {mode === "rush" || mode === "mistakes" ? (
              <p className="mt-1 text-caption text-studio-muted">{tPuzzle(locale, "puzzle.panel.solved")}</p>
            ) : null}
          </div>
          {mode === "rush" ? (
            <p
              className="flex items-center gap-1"
              aria-label={tPuzzle(locale, "puzzle.panel.missesAria", { strikes, total: RUSH_STRIKES })}
            >
              {Array.from({ length: RUSH_STRIKES }, (_, index) => (
                <X
                  key={index}
                  className={`size-4 ${index < strikes ? "text-red-400" : "text-studio-muted opacity-35"}`}
                  aria-hidden
                />
              ))}
            </p>
          ) : (
            <p className="flex items-center gap-1 text-title font-semibold tabular-nums text-studio-fg">
              <Flame className="size-5 text-orange-400" aria-hidden />
              {runStreak}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-studio-bg">
            <div
              className="h-full rounded-full bg-studio-success transition-[width] duration-500"
              style={{ width: `${(level.into / level.span) * 100}%` }}
            />
          </div>
          <span className="inline-flex items-center gap-1 text-caption tabular-nums text-studio-muted">
            <Crown className="size-3 text-studio-warning-fg" aria-hidden />
            {level.level + 1}
          </span>
        </div>

        {mode === "rated" || mode === "daily" ? (
          <p className="text-caption text-studio-muted">
            {tPuzzle(locale, "puzzle.panel.rating")}{" "}
            <span className="tabular-nums text-studio-fg">{formatInteger(locale, progress.rating)}</span>
            {delta !== null && delta !== 0 ? (
              <span className={delta > 0 ? "text-studio-success" : "text-studio-warning-fg"}>
                {" "}
                {delta > 0 ? `+${delta}` : delta}
              </span>
            ) : null}
          </p>
        ) : null}

        {sessionOver ? (
          <p className="text-body text-studio-muted">
            {mode === "rush"
              ? tPuzzle(locale, "puzzle.panel.bestScore", { value: formatInteger(locale, progress.rushBest) })
              : tPuzzle(locale, "puzzle.panel.streakSummary", { solved: sessionSolved, best: progress.bestStreak })}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 border-t border-studio-border p-3">
        {userTurn ? (
          <div className="flex gap-2">
            <Button
              className="flex-1"
              onClick={() => setHintLevel((current) => Math.min(2, current + 1))}
              disabled={hintLevel >= 2}
            >
              {tPuzzle(locale, "puzzle.panel.hint")}
            </Button>
            <Button onClick={giveUp}>{tPuzzle(locale, "puzzle.panel.solution")}</Button>
          </div>
        ) : null}
        {status !== "playing" && continueLabel && !exhausted ? (
          <Button variant="primary" className="w-full" onClick={nextPuzzle}>
            <Check className="size-4" aria-hidden />
            {continueLabel}
            <ChevronRight className="size-4" aria-hidden />
          </Button>
        ) : null}
        {sessionOver ? (
          <Button variant="primary" className="w-full" onClick={retry}>
            {mode === "rush"
              ? tPuzzle(locale, "puzzle.panel.playAgain")
              : tPuzzle(locale, "puzzle.panel.tryAgain")}
          </Button>
        ) : null}
        <Link
          href="/puzzles"
          className={`inline-flex h-8 items-center justify-center rounded-lg px-3 text-body ${
            status !== "playing" && mode === "daily"
              ? "bg-studio-accent font-medium text-studio-accent-fg hover:bg-studio-accent-strong"
              : "text-studio-muted hover:bg-studio-hover hover:text-studio-fg"
          }`}
        >
          {status !== "playing" && mode === "daily"
            ? tPuzzle(locale, "puzzle.panel.backToPuzzles")
            : tPuzzle(locale, "puzzle.panel.puzzles")}
        </Link>
      </div>
    </section>
  );
}
