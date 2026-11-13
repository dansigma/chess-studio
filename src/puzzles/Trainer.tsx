"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { CourseChrome } from "@/src/courses/CourseChrome";
import { phaseName, tierName } from "@/src/chess/review-strings";
import { tMistakes } from "@/src/i18n/mistakes-strings";
import { tPuzzle } from "@/src/i18n/puzzle-strings";
import { useStudioStore } from "@/src/store/studio-store";
import { PuzzleBoard } from "./PuzzleBoard";
import { PuzzlePanel } from "./PuzzlePanel";
import { parseDifficulty, type Difficulty } from "./difficulty";
import { isPuzzleMode, isPuzzleTheme } from "./engine";
import { parseMistakeFilter } from "./mistake-puzzle";
import type { PuzzleMode, PuzzleTheme } from "./types";
import { usePuzzleFeedback } from "./use-puzzle-feedback";
import { usePuzzleScoring } from "./use-puzzle-scoring";
import { usePuzzleSession } from "./use-puzzle-session";

export function PuzzleTrainer() {
  const params = useSearchParams();
  const modeParam = params.get("mode") ?? "";
  const themeParam = params.get("theme") ?? "";
  const mode: PuzzleMode = isPuzzleMode(modeParam) ? modeParam : "rated";
  const theme: PuzzleTheme | null = modeParam === "daily" || !isPuzzleTheme(themeParam) ? null : themeParam;

  // SIG-1256: a difficulty only applies to rated sessions; invalid means none.
  const difficulty: Difficulty | null = mode === "rated" ? parseDifficulty(params.get("difficulty")) : null;

  // SIG-1307: optional label/phase filter, mistakes mode only; invalid ignored.
  const labelParam = params.get("label");
  const phaseParam = params.get("phase");
  const mistakeFilter = useMemo(
    () => (mode === "mistakes" ? parseMistakeFilter(labelParam, phaseParam) : {}),
    [mode, labelParam, phaseParam],
  );

  const locale = useStudioStore((state) => state.settings.locale);
  const boardTheme = useStudioStore((state) => state.settings.boardTheme);
  const pieceSet = useStudioStore((state) => state.settings.pieceSet);
  const showCoordinates = useStudioStore((state) => state.settings.showCoordinates);
  const moveSound = useStudioStore((state) => state.settings.moveSound);

  const filterText = [
    mistakeFilter.phase ? phaseName(locale, mistakeFilter.phase) : null,
    mistakeFilter.label ? tierName(locale, mistakeFilter.label) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const scoring = usePuzzleScoring(mode, difficulty !== null);
  const session = usePuzzleSession({ mode, theme, difficulty, mistakeFilter, moveSound, scoring });
  const feedback = usePuzzleFeedback({ mode, session, locale });

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-studio-bg">
      <CourseChrome />
      {filterText ? (
        <p className="px-4 pt-2 text-caption text-studio-faint" data-testid="mistakes-filter-chip">
          {filterText}
        </p>
      ) : null}
      {session.loadError ? (
        <main className="px-6 py-10 text-body text-studio-warning-fg">
          {tPuzzle(locale, "puzzle.trainer.loadError")}
        </main>
      ) : mode === "mistakes" && session.caughtUp && session.attempts.length === 0 && scoring.progress ? (
        // SIG-1097: empty queue renders the caught-up state, not the spinner.
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
          <h1 className="text-2xl font-semibold text-studio-fg">
            {tMistakes(locale, "mistakes.trainer.caughtUp.title")}
          </h1>
          <p className="mt-2 text-body text-studio-muted">
            {session.nextDue
              ? tMistakes(locale, "mistakes.trainer.caughtUp.nextDue", { date: session.nextDue })
              : tMistakes(locale, "mistakes.trainer.caughtUp.body")}
          </p>
          <Link href="/puzzles" className="mt-4 inline-block text-body text-studio-accent-text">
            {tMistakes(locale, "mistakes.trainer.caughtUp.back")}
          </Link>
        </main>
      ) : session.exhausted && session.attempts.length === 0 && scoring.progress ? (
        // SIG-1179: every puzzle in the widened pool is seen — show the empty
        // state instead of re-serving a seen puzzle.
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
          <h1 className="text-2xl font-semibold text-studio-fg">
            {tPuzzle(locale, "puzzle.trainer.exhausted.title")}
          </h1>
          <p className="mt-2 text-body text-studio-muted">
            {tPuzzle(locale, "puzzle.trainer.exhausted.body")}
          </p>
          <Link href="/puzzles" className="mt-4 inline-block text-body text-studio-accent-text">
            {tPuzzle(locale, "puzzle.trainer.exhausted.back")}
          </Link>
        </main>
      ) : !scoring.progress || !session.puzzle || !session.fen ? (
        <main className="px-6 py-10 text-body text-studio-muted" role="status">
          {tPuzzle(locale, "puzzle.trainer.loading")}
        </main>
      ) : (
        // SIG-1248: on lg+ this region is a size container; the board is
        // min(available height, available width - panel - gap, 880px) and the
        // panel takes exactly that height. Below lg the layout stays stacked.
        <div className="flex min-h-0 w-full flex-1 flex-col px-4 py-3 lg:items-center lg:justify-center lg:px-8 lg:py-6 lg:[container-type:size]">
        <div className="grid min-h-0 w-full flex-1 grid-rows-[minmax(0,1fr)_auto] gap-3 lg:h-[var(--board)] lg:w-auto lg:flex-none lg:grid-cols-[var(--board)_24rem] lg:grid-rows-1 lg:gap-6 lg:[--board:min(100cqh,calc(100cqw_-_25.5rem),880px)]">
          <PuzzleBoard
            session={session}
            feedback={feedback}
            boardTheme={boardTheme}
            pieceSet={pieceSet}
            showCoordinates={showCoordinates}
          />
          <PuzzlePanel mode={mode} theme={theme} difficulty={difficulty} session={session} feedback={feedback} locale={locale} />
        </div>
        </div>
      )}
    </div>
  );
}
