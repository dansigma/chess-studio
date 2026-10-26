"use client";

import { useCallback, useRef, useState } from "react";
import { applyResult, type CompiledPuzzle } from "./engine";
import { saveProgress } from "./progress";
import type { PuzzleMode, PuzzleModeAttempt, PuzzleProgress } from "./types";

export function applyPuzzleResult(
  current: PuzzleProgress,
  attempt: PuzzleModeAttempt,
): { next: PuzzleProgress; delta: number; gained: number } {
  const next = applyResult(current, attempt);
  return { next, delta: next.rating - current.rating, gained: next.xp - current.xp };
}

export function usePuzzleScoring(mode: PuzzleMode) {
  const [progress, setProgress] = useState<PuzzleProgress | null>(null);
  const [delta, setDelta] = useState<number | null>(null);
  const [gained, setGained] = useState(0);
  const progressRef = useRef<PuzzleProgress | null>(null);
  const recorded = useRef(false);

  const hydrate = useCallback((loaded: PuzzleProgress) => {
    progressRef.current = loaded;
    setProgress(loaded);
  }, []);

  const resetResult = useCallback(() => {
    recorded.current = false;
    setDelta(null);
    setGained(0);
  }, []);

  const commit = useCallback(
    (
      success: boolean,
      currentPuzzle: CompiledPuzzle,
      sessionScore: number,
      ms: number | null = null,
    ): boolean => {
      const current = progressRef.current;
      if (!current || recorded.current) {
        return false;
      }
      recorded.current = true;
      const { next, delta: ratingDelta, gained: xpGained } = applyPuzzleResult(current, {
        id: currentPuzzle.id,
        mode,
        success,
        puzzleRating: currentPuzzle.rating,
        sessionScore,
        now: Date.now(),
        themes: currentPuzzle.themes,
        ms,
      });
      progressRef.current = next;
      setProgress(next);
      setDelta(ratingDelta);
      setGained(xpGained);
      void saveProgress(next);
      return true;
    },
    [mode],
  );

  return { progress, delta, gained, progressRef, hydrate, resetResult, commit };
}

export type PuzzleScoring = ReturnType<typeof usePuzzleScoring>;
