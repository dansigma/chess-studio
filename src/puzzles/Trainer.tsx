"use client";

import { useSearchParams } from "next/navigation";
import { CourseChrome } from "@/src/courses/CourseChrome";
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

  const boardTheme = useStudioStore((state) => state.settings.boardTheme);
  const pieceSet = useStudioStore((state) => state.settings.pieceSet);
  const showCoordinates = useStudioStore((state) => state.settings.showCoordinates);
  const moveSound = useStudioStore((state) => state.settings.moveSound);

  const scoring = usePuzzleScoring(mode);
  const session = usePuzzleSession({ mode, theme, moveSound, scoring });
  const feedback = usePuzzleFeedback({ mode, session });

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-studio-bg">
      <CourseChrome />
      {session.loadError ? (
        <main className="px-6 py-10 text-body text-studio-warning-fg">{session.loadError}</main>
      ) : !scoring.progress || !session.puzzle || !session.fen ? (
        <main className="px-6 py-10 text-body text-studio-muted" role="status">
          Loading puzzle…
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
          <PuzzlePanel mode={mode} theme={theme} session={session} feedback={feedback} />
        </div>
      )}
    </div>
  );
}
