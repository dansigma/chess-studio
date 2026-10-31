"use client";

import { useEffect, useRef, useState } from "react";
import { playMoveSound } from "@/src/chess/move-sound";
import { createBrowserSupabase } from "@/src/lib/supabase/client";
import {
  hydrateExercises,
  recordAttempt,
  saveExercises,
  type MistakeExercisesMap,
} from "@/src/lib/mistake-exercises-store";
import {
  dailyPuzzle,
  judgeMove,
  playUci,
  rankedPuzzles,
  sessionTarget,
  type CompiledPuzzle,
} from "./engine";
import {
  exerciseKeyForPuzzle,
  mistakesQueue,
  nextDueDate,
  type MistakesQueueEntry,
} from "./mistake-puzzle";
import { loadPuzzleCatalog } from "./puzzle-client";
import { hydratePuzzleProgress } from "./progress";
import type { PuzzleMode, PuzzleTheme } from "./types";
import type { PuzzleScoring } from "./use-puzzle-scoring";

export const RUSH_SECONDS = 180;
export const RUSH_STRIKES = 3;

export type Miss = { fen: string; from: string; to: string; san: string };
export type Status = "playing" | "solved" | "failed";

export function clock(total: number): string {
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function pickPuzzle(
  puzzles: readonly CompiledPuzzle[],
  mode: PuzzleMode,
  theme: PuzzleTheme | null,
  progress: { rating: number },
  solvedInSession: number,
  exclude: ReadonlySet<string>,
): CompiledPuzzle | null {
  if (mode === "daily") {
    return dailyPuzzle(puzzles, Date.now());
  }
  const target = sessionTarget(progress.rating, solvedInSession, mode);
  const ranked = rankedPuzzles(puzzles, target, exclude, theme ?? undefined);
  if (ranked.length === 0) {
    return null;
  }
  const windowed = ranked.slice(0, Math.min(4, ranked.length));
  return windowed[Math.floor(Math.random() * windowed.length)] ?? ranked[0] ?? null;
}

/**
 * SIG-1102: rating windows for the windowed table load, widest last. The
 * session tries each window in order and stops at the first with enough
 * puzzles, so rated mode draws within ±100 whenever the table has them.
 */
export function ratingWindowRequests(
  target: number,
  attempts = 4,
  step = 100,
): Array<{ minRating: number; maxRating: number }> {
  const windows: Array<{ minRating: number; maxRating: number }> = [];
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const half = step * (attempt + 1);
    windows.push({
      minRating: Math.max(0, Math.floor(target - half)),
      maxRating: Math.ceil(target + half),
    });
  }
  return windows;
}

export function nextSessionScore(success: boolean, solved: number): number {
  return success ? solved + 1 : solved;
}

/**
 * SIG-1102: load the rating window around the session target, widening on
 * thin results. Daily mode is excluded by the caller (date-keyed identity
 * comes from the full catalog).
 */
export async function loadWindowedCatalog(
  mode: PuzzleMode,
  theme: PuzzleTheme | null,
  rating: number,
  solvedInSession: number,
  exclude: ReadonlySet<string>,
  loader: typeof loadPuzzleCatalog = loadPuzzleCatalog,
): Promise<CompiledPuzzle[]> {
  const seed = (Math.random() * 0xffffffff) >>> 0;
  let widest: CompiledPuzzle[] = [];
  for (const window of ratingWindowRequests(sessionTarget(rating, solvedInSession, mode))) {
    const catalog = await loader({
      minRating: window.minRating,
      maxRating: window.maxRating,
      theme: theme ?? undefined,
      limit: 50,
      exclude: [...exclude],
      seed,
    });
    widest = catalog;
    if (catalog.length >= 5) {
      return catalog;
    }
  }
  return widest;
}

export function rushAfterMiss(strikes: number, secondsLeft: number): { strikes: number; over: boolean } {
  const next = strikes + 1;
  return { strikes: next, over: next >= RUSH_STRIKES || secondsLeft <= 0 };
}

export function usePuzzleSession({
  mode,
  theme,
  moveSound,
  scoring,
}: {
  mode: PuzzleMode;
  theme: PuzzleTheme | null;
  moveSound: boolean;
  scoring: PuzzleScoring;
}) {
  const { progress, delta, gained, progressRef, hydrate, resetResult, commit: applyScore } = scoring;

  const [puzzle, setPuzzle] = useState<CompiledPuzzle | null>(null);
  const [fen, setFen] = useState("");
  const [ply, setPly] = useState(0);
  const [status, setStatus] = useState<Status>("playing");
  const [last, setLast] = useState<{ from: string; to: string } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [hintLevel, setHintLevel] = useState(0);
  const [reveal, setReveal] = useState(false);
  const [miss, setMiss] = useState<Miss | null>(null);
  const [sessionSolved, setSessionSolved] = useState(0);
  const [strikes, setStrikes] = useState(0);
  const [sessionOver, setSessionOver] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(RUSH_SECONDS);
  const [loadError, setLoadError] = useState<boolean>(false);
  // SIG-1097: mistakes queue state. `caughtUp` is true when the queue is
  // empty; `nextDue` is the earliest scheduled due date (null when no
  // scheduled entries exist).
  const [caughtUp, setCaughtUp] = useState(false);
  const [nextDue, setNextDue] = useState<string | null>(null);
  const [mistakesTotal, setMistakesTotal] = useState(0);
  const [mistakesIndex, setMistakesIndex] = useState(0);
  // SIG-1070: the display sentence resolves through the puzzle string table
  // at the render site (Trainer), which owns the store locale.

  const catalogRef = useRef<CompiledPuzzle[]>([]);
  const mistakesRef = useRef<MistakesQueueEntry[]>([]);
  const mistakesIndexRef = useRef(0);
  const exercisesRef = useRef<MistakeExercisesMap>({});
  const exercisesUserIdRef = useRef<string | null>(null);
  const sessionSolvedRef = useRef(0);
  const strikesRef = useRef(0);
  const secondsRef = useRef(RUSH_SECONDS);
  const exclude = useRef(new Set<string>());
  const fenRef = useRef("");
  const advanceTimer = useRef<number | null>(null);
  // SIG-1103: solve-time clock. Stamped when a puzzle is shown, read when the
  // attempt commits — time is measured, never limited.
  const shownAtRef = useRef<number>(0);

  useEffect(() => {
    fenRef.current = fen;
  });

  function clearAdvance() {
    if (advanceTimer.current !== null) {
      window.clearTimeout(advanceTimer.current);
      advanceTimer.current = null;
    }
  }

  function showPuzzle(next: CompiledPuzzle) {
    clearAdvance();
    resetResult();
    shownAtRef.current = Date.now();
    setPuzzle(next);
    setFen(next.fen);
    setPly(0);
    setStatus("playing");
    setLast(null);
    setSelected(null);
    setHintLevel(0);
    setReveal(false);
    setMiss(null);
  }

  function commit(success: boolean, currentPuzzle: CompiledPuzzle) {
    // SIG-1097: record the spaced-repetition outcome. Board ids are mapped
    // back to exercise keys (colons break the board's querySelector).
    if (mode === "mistakes") {
      const next = recordAttempt(exercisesRef.current, exerciseKeyForPuzzle(currentPuzzle.id), success);
      exercisesRef.current = next;
      setNextDue(nextDueDate(next));
      void saveExercises(next, exercisesUserIdRef.current);
    }
    const score = nextSessionScore(success, sessionSolvedRef.current);
    const ms = Math.max(0, Date.now() - shownAtRef.current);
    if (!applyScore(success, currentPuzzle, score, ms)) {
      return;
    }
    sessionSolvedRef.current = score;
    setSessionSolved(score);
    if (!success && mode === "streak") {
      setSessionOver(true);
    }
  }

  function scheduleRush(delay: number) {
    clearAdvance();
    advanceTimer.current = window.setTimeout(() => {
      advanceTimer.current = null;
      if (secondsRef.current > 0 && strikesRef.current < RUSH_STRIKES) {
        nextPuzzle();
      }
    }, delay);
  }

  function registerRushMiss() {
    const { strikes: next, over } = rushAfterMiss(strikesRef.current, secondsRef.current);
    strikesRef.current = next;
    setStrikes(next);
    if (over) {
      clearAdvance();
      setSessionOver(true);
      return;
    }
    scheduleRush(900);
  }

  useEffect(() => {
    let cancel = false;
    void (async () => {
      try {
        const supabase = createBrowserSupabase();
        const user = supabase ? (await supabase.auth.getUser()).data.user : null;
        const userId = user?.id ?? null;
        const loaded = await hydratePuzzleProgress(userId);
        if (cancel) {
          return;
        }
        if (mode === "mistakes") {
          // SIG-1097: no catalog fetch — the queue comes from saved exercises.
          const map = await hydrateExercises(userId);
          if (cancel) {
            return;
          }
          exercisesRef.current = map;
          exercisesUserIdRef.current = userId;
          const queue = mistakesQueue(map, exclude.current);
          mistakesRef.current = queue;
          mistakesIndexRef.current = 0;
          hydrate(loaded);
          sessionSolvedRef.current = 0;
          exclude.current = new Set();
          setSessionSolved(0);
          strikesRef.current = 0;
          setStrikes(0);
          setSessionOver(false);
          secondsRef.current = RUSH_SECONDS;
          setSecondsLeft(RUSH_SECONDS);
          setMistakesTotal(queue.length);
          setMistakesIndex(0);
          setNextDue(nextDueDate(map));
          const first = queue[0]?.puzzle ?? null;
          setCaughtUp(!first);
          if (!first) {
            setPuzzle(null);
            setLoadError(false);
            return;
          }
          exclude.current.add(first.id);
          resetResult();
          setPuzzle(first);
          setFen(first.fen);
          setPly(0);
          setStatus("playing");
          setLast(null);
          setSelected(null);
          setHintLevel(0);
          setReveal(false);
          setMiss(null);
          setLoadError(false);
          return;
        }
        const catalog =
          mode === "daily"
            ? await loadPuzzleCatalog()
            : await loadWindowedCatalog(mode, theme, loaded.rating, 0, exclude.current);
        if (cancel) {
          return;
        }
        catalogRef.current = catalog;
        hydrate(loaded);
        sessionSolvedRef.current = 0;
        exclude.current = new Set();
        setSessionSolved(0);
        strikesRef.current = 0;
        setStrikes(0);
        setSessionOver(false);
        secondsRef.current = RUSH_SECONDS;
        setSecondsLeft(RUSH_SECONDS);
        const first = pickPuzzle(catalogRef.current, mode, theme, loaded, 0, exclude.current);
        if (!first) {
          setPuzzle(null);
          setLoadError(false);
          return;
        }
        exclude.current.add(first.id);
        resetResult();
        setPuzzle(first);
        setFen(first.fen);
        setPly(0);
        setStatus("playing");
        setLast(null);
        setSelected(null);
        setHintLevel(0);
        setReveal(false);
        setMiss(null);
        setLoadError(false);
      } catch (error) {
        console.error("Failed to load puzzle progress.", error);
        if (!cancel) {
          setLoadError(true);
        }
      }
    })();
    return () => {
      cancel = true;
    };
  }, [mode, theme, hydrate, resetResult]);

  useEffect(() => {
    return () => clearAdvance();
  }, []);

  useEffect(() => {
    if (!puzzle || status !== "playing" || sessionOver || ply % 2 === 0 || ply >= puzzle.uci.length) {
      return;
    }
    const uci = puzzle.uci[ply];
    if (!uci) {
      return;
    }
    const timer = window.setTimeout(() => {
      const step = playUci(fenRef.current, uci);
      setFen(step.fen);
      setLast({ from: step.from, to: step.to });
      setPly((current) => current + 1);
      if (moveSound) {
        playMoveSound();
      }
    }, 340);
    return () => window.clearTimeout(timer);
  }, [puzzle, status, sessionOver, ply, moveSound]);

  useEffect(() => {
    if (status !== "failed" || !miss || reveal) {
      return;
    }
    const timer = window.setTimeout(() => {
      setFen(miss.fen);
      setLast(null);
      setReveal(true);
    }, 420);
    return () => window.clearTimeout(timer);
  }, [status, miss, reveal]);

  useEffect(() => {
    if (mode !== "rush" || sessionOver || !progress) {
      return;
    }
    const timer = window.setInterval(() => {
      setSecondsLeft((value) => {
        const next = value <= 1 ? 0 : value - 1;
        secondsRef.current = next;
        return next;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [mode, sessionOver, progress]);

  useEffect(() => {
    if (sessionOver) {
      clearAdvance();
    }
  }, [sessionOver]);

  if (mode === "rush" && secondsLeft === 0 && !sessionOver) {
    setSessionOver(true);
  }

  const userTurn = status === "playing" && !sessionOver && ply % 2 === 0;
  const expected = puzzle && ply < puzzle.uci.length ? puzzle.uci[ply] : undefined;

  function onDrop(from: string, to: string): boolean {
    if (!puzzle || !userTurn || !expected) {
      return false;
    }
    const judged = judgeMove(fen, expected, from, to, puzzle.themes.includes("mate"));
    if (judged.kind === "illegal") {
      return false;
    }
    setSelected(null);
    setHintLevel(0);
    if (moveSound) {
      playMoveSound();
    }
    if (judged.kind === "wrong") {
      setFen(judged.fen);
      setLast({ from: judged.from, to: judged.to });
      setMiss({ fen, from: expected.slice(0, 2), to: expected.slice(2, 4), san: puzzle.sans[ply] ?? "" });
      setStatus("failed");
      commit(false, puzzle);
      if (mode === "rush") {
        registerRushMiss();
      }
      return true;
    }
    setFen(judged.fen);
    setLast({ from: judged.from, to: judged.to });
    const nextPly = ply + 1;
    setPly(nextPly);
    if (judged.mate || nextPly >= puzzle.uci.length) {
      setStatus("solved");
      commit(true, puzzle);
      if (mode === "rush" && secondsRef.current > 0) {
        scheduleRush(700);
      }
    }
    return true;
  }

  function giveUp() {
    if (!puzzle || !userTurn || !expected) {
      return;
    }
    setSelected(null);
    setMiss({ fen, from: expected.slice(0, 2), to: expected.slice(2, 4), san: puzzle.sans[ply] ?? "" });
    setStatus("failed");
    commit(false, puzzle);
    if (mode === "rush") {
      registerRushMiss();
    }
  }

  function nextPuzzle() {
    clearAdvance();
    if (mode === "mistakes") {
      // SIG-1097: sequential walk over the queue built at load. Every entry
      // gets one pass; SRS state (`recordAttempt` at commit time) decides
      // whether it returns tomorrow (failed) or later (solved) — the queue
      // itself just advances to the next unshown entry.
      const queue = mistakesRef.current.length > 0 ? mistakesRef.current : mistakesQueue(exercisesRef.current, exclude.current);
      mistakesRef.current = queue;
      const at = mistakesIndexRef.current + 1;
      if (at >= queue.length) {
        mistakesIndexRef.current = queue.length;
        setMistakesIndex(queue.length);
        setCaughtUp(true);
        setNextDue(nextDueDate(exercisesRef.current));
        return;
      }
      mistakesIndexRef.current = at;
      setMistakesIndex(at);
      const chosen = queue[at];
      if (!chosen) {
        setCaughtUp(true);
        setNextDue(nextDueDate(exercisesRef.current));
        return;
      }
      exclude.current.add(chosen.puzzle.id);
      showPuzzle(chosen.puzzle);
      return;
    }
    const current = progressRef.current;
    if (!current || mode === "daily") {
      return;
    }
    const chosen = pickPuzzle(catalogRef.current, mode, theme, current, sessionSolvedRef.current, exclude.current);
    if (!chosen) {
      return;
    }
    exclude.current.add(chosen.id);
    showPuzzle(chosen);
  }

  function retry() {
    if (mode === "mistakes") {
      // SIG-1097: rebuild from the current map — failed exercises are due
      // again, solved ones are scheduled out.
      const queue = mistakesQueue(exercisesRef.current, new Set());
      mistakesRef.current = queue;
      mistakesIndexRef.current = 0;
      exclude.current = new Set();
      sessionSolvedRef.current = 0;
      setSessionSolved(0);
      strikesRef.current = 0;
      setStrikes(0);
      setSessionOver(false);
      secondsRef.current = RUSH_SECONDS;
      setSecondsLeft(RUSH_SECONDS);
      setMistakesTotal(queue.length);
      setMistakesIndex(0);
      setNextDue(nextDueDate(exercisesRef.current));
      const chosen = queue[0]?.puzzle ?? null;
      setCaughtUp(!chosen);
      if (!chosen) {
        return;
      }
      exclude.current.add(chosen.id);
      showPuzzle(chosen);
      return;
    }
    const current = progressRef.current;
    if (!current) {
      return;
    }
    exclude.current = new Set();
    sessionSolvedRef.current = 0;
    setSessionSolved(0);
    strikesRef.current = 0;
    setStrikes(0);
    setSessionOver(false);
    secondsRef.current = RUSH_SECONDS;
    setSecondsLeft(RUSH_SECONDS);
    const chosen = pickPuzzle(catalogRef.current, mode, theme, current, 0, exclude.current);
    if (!chosen) {
      return;
    }
    exclude.current.add(chosen.id);
    showPuzzle(chosen);
  }

  return {
    puzzle,
    fen,
    ply,
    status,
    last,
    selected,
    hintLevel,
    reveal,
    miss,
    sessionSolved,
    strikes,
    sessionOver,
    secondsLeft,
    loadError,
    caughtUp,
    nextDue,
    mistakesTotal,
    mistakesIndex,
    progress,
    delta,
    gained,
    userTurn,
    expected,
    onDrop,
    giveUp,
    nextPuzzle,
    retry,
    setSelected,
    setHintLevel,
  };
}

export type PuzzleSession = ReturnType<typeof usePuzzleSession>;
