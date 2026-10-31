"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { CourseChrome } from "@/src/courses/CourseChrome";
import { tMistakes } from "@/src/i18n/mistakes-strings";
import { tPuzzle } from "@/src/i18n/puzzle-strings";
import { useStudioStore } from "@/src/store/studio-store";
import { PuzzleBoard } from "./PuzzleBoard";
import { PuzzlePanel } from "./PuzzlePanel";
import { isPuzzleMode, isPuzzleTheme } from "./engine";
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

  const locale = useStudioStore((state) => state.settings.locale);
  const boardTheme = useStudioStore((state) => state.settings.boardTheme);
  const pieceSet = useStudioStore((state) => state.settings.pieceSet);
  const showCoordinates = useStudioStore((state) => state.settings.showCoordinates);
  const moveSound = useStudioStore((state) => state.settings.moveSound);

  const scoring = usePuzzleScoring(mode);
  const session = usePuzzleSession({ mode, theme, moveSound, scoring });
  const feedback = usePuzzleFeedback({ mode, session, locale });

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-studio-bg">
      <CourseChrome />
      {session.loadError ? (
        <main className="px-6 py-10 text-body text-studio-warning-fg">
          {tPuzzle(locale, "puzzle.trainer.loadError")}
        </main>
      ) : mode === "mistakes" && session.caughtUp && scoring.progress ? (
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
      ) : session.exhausted && scoring.progress ? (
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
        <div className="mx-auto grid min-h-0 w-full max-w-5xl flex-1 grid-rows-[minmax(0,1fr)_auto] gap-3 px-4 py-3 lg:grid-cols-[minmax(0,520px)_minmax(0,1fr)] lg:grid-rows-1 lg:gap-6 lg:py-6">
          <PuzzleBoard
            session={session}
            feedback={feedback}
            boardTheme={boardTheme}
            pieceSet={pieceSet}
            showCoordinates={showCoordinates}
          />
          <PuzzlePanel mode={mode} theme={theme} session={session} feedback={feedback} locale={locale} />
        </div>
      )}
    </div>
  );
}
