"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronRight, Crown } from "lucide-react";
import type { SiteLocale } from "@/src/i18n/locale";
import { formatInteger } from "@/src/i18n/format";
import { tPuzzle } from "@/src/i18n/puzzle-strings";
import { Button } from "@/src/studio/ui/Button";
import { Badge } from "@/src/studio/ui/Controls";
import type { Difficulty } from "./difficulty";
import { THEME_LABEL_KEYS, type PuzzleMode, type PuzzleTheme } from "./types";
import { RUSH_STRIKES, clock, type PuzzleSession } from "./use-puzzle-session";
import type { PuzzleFeedback } from "./use-puzzle-feedback";
import { PanelScore } from "./PanelScore";
import { LevelBar, XpBreakdownLine } from "./XpBreakdown";
import { SessionSummary } from "./SessionSummary";
import { buildSessionSummary } from "./session-summary";
import { AnalyzeInStudioButton, PuzzleSourceLine } from "./PuzzleStudioLinks";
import { openPuzzleInStudio } from "./studio-handoff";

export function PuzzlePanel({
  mode,
  theme,
  difficulty = null,
  session,
  feedback,
  locale,
}: {
  mode: PuzzleMode;
  theme: PuzzleTheme | null;
  difficulty?: Difficulty | null;
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
    sessionStart,
    attempts,
    summaryVisible,
    dueMistakes,
    finishSession,
    delta,
    xpResult,
    hintLevel,
    setHintLevel,
    giveUp,
    nextPuzzle,
    retry,
    miss,
    reveal,
    userTurn,
  } = session;
  const router = useRouter();
  const { level, modeLabel, continueLabel, bubbleTitle, bubbleBody, solverMoves, solverIndex, runStreak } = feedback;

  const summary = useMemo(
    () =>
      summaryVisible && progress && sessionStart
        ? buildSessionSummary({ mode, attempts, before: sessionStart, after: progress, unrated: difficulty !== null })
        : null,
    [summaryVisible, mode, difficulty, attempts, sessionStart, progress],
  );

  if (!puzzle || !progress) {
    return null;
  }

  if (summary) {
    // SIG-1235: the summary replaces the panel; the board stays on screen.
    return (
      <SessionSummary
        summary={summary}
        locale={locale}
        onTrainAgain={retry}
        onAnalyze={(played) =>
          openPuzzleInStudio(played, mode, locale, (href) => router.push(href), window.location.origin)
        }
        trainAgainHref={mode === "daily" ? "/puzzles/play?mode=rated" : undefined}
        canReview={summary.failed > 0 && mode !== "mistakes" && (dueMistakes ?? 0) > 0}
      />
    );
  }

  return (
    <section className="flex max-h-[min(48dvh,420px)] min-h-40 flex-col overflow-hidden rounded-xl border border-studio-border bg-studio-chrome lg:h-full lg:max-h-none lg:min-h-0">
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
          <span className="text-body tabular-nums text-studio-muted">
            {tPuzzle(locale, "puzzle.panel.puzzleRating", { rating: formatInteger(locale, puzzle.rating) })}
          </span>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-4">
        <PanelScore
          mode={mode}
          locale={locale}
          rating={progress.rating}
          delta={delta}
          solved={sessionSolved}
          streak={runStreak}
          strikes={strikes}
          strikeLimit={RUSH_STRIKES}
          unrated={difficulty !== null}
        />
        {difficulty ? (
          <p className="text-dense text-studio-muted" data-testid="panel-unrated">
            <Badge tone="accent">{tPuzzle(locale, `puzzle.difficulty.${difficulty}`)}</Badge>{" "}
            {tPuzzle(locale, "puzzle.panel.unrated")}
          </p>
        ) : null}

        <LevelBar level={level} locale={locale} totalXp={mode === "mistakes" ? undefined : progress.xp} />

        {/* SIG-1248: only the result block is live; the score and level stay outside so they are not re-announced. */}
        <div className="rounded-xl bg-studio-hover px-4 py-3" aria-live="polite">
          <p className="text-body font-semibold text-studio-fg">{bubbleTitle}</p>
          <p className="mt-1 text-body text-studio-muted">{bubbleBody}</p>
          {solverMoves > 1 && status === "playing" && !sessionOver ? (
            <p className="mt-1 text-body text-studio-muted">
              {tPuzzle(locale, "puzzle.panel.moveCounter", {
                current: Math.min(solverIndex, solverMoves),
                total: solverMoves,
              })}
            </p>
          ) : null}
          {xpResult && status !== "playing" ? (
            <XpBreakdownLine breakdown={xpResult.breakdown} awarded={xpResult.awarded} locale={locale} />
          ) : null}
          {sessionOver && mode === "rush" && reveal && miss ? (
            <p className="mt-1 text-body text-studio-muted">
              {tPuzzle(locale, "puzzle.panel.bestMove", { san: miss.san })}
            </p>
          ) : null}
          {/* SIG-1236: hidden while playing so the Lichess page cannot spoil the line. */}
          {status !== "playing" ? <PuzzleSourceLine puzzleId={puzzle.id} locale={locale} /> : null}
        </div>
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
        {status !== "playing" ? (
          <AnalyzeInStudioButton
            locale={locale}
            onAnalyze={() =>
              openPuzzleInStudio(puzzle, mode, locale, (href) => router.push(href), window.location.origin)
            }
          />
        ) : null}
        {status !== "playing" && continueLabel && !exhausted ? (
          <Button variant="primary" className="w-full" onClick={nextPuzzle}>
            <Check className="size-4" aria-hidden />
            {continueLabel}
            <ChevronRight className="size-4" aria-hidden />
          </Button>
        ) : null}
        {(mode === "rated" || mode === "mistakes") && attempts.length > 0 ? (
          // SIG-1235: rated and mistakes sessions have no natural end; the
          // user ends them here and sees the summary.
          <Button className="w-full" onClick={finishSession}>
            {tPuzzle(locale, "puzzle.summary.action.finish")}
          </Button>
        ) : null}
        <Link
          href="/puzzles"
          className="inline-flex h-8 items-center justify-center rounded-lg px-3 text-body text-studio-muted hover:bg-studio-hover hover:text-studio-fg"
        >
          {tPuzzle(locale, "puzzle.panel.puzzles")}
        </Link>
      </div>
    </section>
  );
}
