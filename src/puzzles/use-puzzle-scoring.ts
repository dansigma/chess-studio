"use client";

import { useCallback, useRef, useState } from "react";
import { applyResult, attemptXp, type CompiledPuzzle } from "./engine";
import { saveProgress } from "./progress";
import type { PuzzleMode, PuzzleModeAttempt, PuzzleProgress } from "./types";
import type { XpBreakdown } from "./xp";

// SIG-1234: what the panel renders after a puzzle. `awarded` is false when the
// attempt scored XP on paper but progress did not change (mistakes practice,
// a repeated daily), so the UI can say so instead of implying a gain.
export type XpResult = { breakdown: XpBreakdown; awarded: boolean };

export function applyPuzzleResult(
  current: PuzzleProgress,
  attempt: PuzzleModeAttempt,
): { next: PuzzleProgress; delta: number; gained: number; xp: XpResult } {
  const next = applyResult(current, attempt);
  const breakdown = attemptXp(current, attempt);
  return {
    next,
    delta: next.rating - current.rating,
    gained: next.xp - current.xp,
    // Since SIG-1232, mistakes practice returns a new object (activity
    // counter), so "awarded" compares the XP actually added, not identity.
    xp: { breakdown, awarded: next.xp - current.xp === breakdown.total },
  };
}

export function usePuzzleScoring(mode: PuzzleMode, unrated = false) {
  const [progress, setProgress] = useState<PuzzleProgress | null>(null);
  const [delta, setDelta] = useState<number | null>(null);
  const [gained, setGained] = useState(0);
  const [xpResult, setXpResult] = useState<XpResult | null>(null);
  // SIG-1234: XP awarded since the session started, for the summary (SIG-1235).
  const [sessionXp, setSessionXp] = useState(0);
  // SIG-1235: progress when the session started, the "before" of the summary.
  const [sessionStart, setSessionStart] = useState<PuzzleProgress | null>(null);
  const progressRef = useRef<PuzzleProgress | null>(null);
  const recorded = useRef(false);

  const hydrate = useCallback((loaded: PuzzleProgress) => {
    progressRef.current = loaded;
    setProgress(loaded);
    setSessionXp(0);
    setSessionStart(loaded);
  }, []);

  // A new session (retry) starts from whatever progress is current.
  const resetSessionXp = useCallback(() => {
    setSessionXp(0);
    setSessionStart(progressRef.current);
  }, []);

  const resetResult = useCallback(() => {
    recorded.current = false;
    setDelta(null);
    setGained(0);
    setXpResult(null);
  }, []);

  const commit = useCallback(
    (
      success: boolean,
      currentPuzzle: CompiledPuzzle,
      sessionScore: number,
      ms: number | null = null,
      hinted = false,
    ): XpResult | null => {
      const current = progressRef.current;
      if (!current || recorded.current) {
        return null;
      }
      recorded.current = true;
      const { next, delta: ratingDelta, gained: xpGained, xp } = applyPuzzleResult(current, {
        id: currentPuzzle.id,
        mode,
        success,
        puzzleRating: currentPuzzle.rating,
        sessionScore,
        now: Date.now(),
        themes: currentPuzzle.themes,
        ms,
        hinted,
        solverMoves: Math.ceil(currentPuzzle.uci.length / 2),
        unrated,
      });
      progressRef.current = next;
      setProgress(next);
      setDelta(ratingDelta);
      setGained(xpGained);
      setXpResult(xp);
      setSessionXp((total) => total + xpGained);
      // SIG-1097/SIG-1232: mistakes practice changes only today's activity
      // counter, which is persisted like any other mode.
      if (next !== current) {
        void saveProgress(next);
      }
      return xp;
    },
    [mode, unrated],
  );

  return {
    progress,
    delta,
    gained,
    xpResult,
    sessionXp,
    sessionStart,
    progressRef,
    hydrate,
    resetResult,
    resetSessionXp,
    commit,
  };
}

export type PuzzleScoring = ReturnType<typeof usePuzzleScoring>;
