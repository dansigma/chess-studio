"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Chess, type Square } from "chess.js";
import { Chessboard } from "react-chessboard";
import { Check, ChevronRight, Crown, Flame, X } from "lucide-react";
import { boardSquareStyles } from "@/src/chess/board-themes";
import { MARK_HEX } from "@/src/chess/marks";
import { playMoveSound } from "@/src/chess/move-sound";
import { piecesForSet } from "@/src/chess/piece-sets";
import { CourseChrome } from "@/src/courses/CourseChrome";
import { useStudioStore } from "@/src/store/studio-store";
import { Button } from "@/src/studio/ui/Button";
import {
  applyResult,
  dailyPuzzle,
  isPuzzleMode,
  isPuzzleTheme,
  judgeMove,
  playUci,
  PUZZLES,
  rankedPuzzles,
  sessionTarget,
  levelFromXp,
  type CompiledPuzzle,
} from "./engine";
import { puzzleGoal, solvedPraise, squareAnchor } from "./feedback";
import { loadProgress, saveProgress } from "./progress";
import { THEME_LABELS, type PuzzleMode, type PuzzleProgress, type PuzzleTheme } from "./types";

const RUSH_SECONDS = 180;
const RUSH_STRIKES = 3;

type Miss = { fen: string; from: string; to: string; san: string };
type Status = "playing" | "solved" | "failed";

function clock(total: number): string {
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function pickPuzzle(
  mode: PuzzleMode,
  theme: PuzzleTheme | null,
  progress: PuzzleProgress,
  solvedInSession: number,
  exclude: ReadonlySet<string>,
): CompiledPuzzle | null {
  if (mode === "daily") {
    return dailyPuzzle(PUZZLES, Date.now());
  }
  const target = sessionTarget(progress.rating, solvedInSession, mode);
  const ranked = rankedPuzzles(PUZZLES, target, exclude, theme ?? undefined);
  if (ranked.length === 0) {
    return null;
  }
  const windowed = ranked.slice(0, Math.min(4, ranked.length));
  return windowed[Math.floor(Math.random() * windowed.length)] ?? ranked[0] ?? null;
}

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

  const [progress, setProgress] = useState<PuzzleProgress | null>(null);
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
  const [delta, setDelta] = useState<number | null>(null);
  const [gained, setGained] = useState(0);

  const progressRef = useRef<PuzzleProgress | null>(null);
  const sessionSolvedRef = useRef(0);
  const strikesRef = useRef(0);
  const secondsRef = useRef(RUSH_SECONDS);
  const recorded = useRef(false);
  const exclude = useRef(new Set<string>());
  const fenRef = useRef("");
  const advanceTimer = useRef<number | null>(null);
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
    recorded.current = false;
    setPuzzle(next);
    setFen(next.fen);
    setPly(0);
    setStatus("playing");
    setLast(null);
    setSelected(null);
    setHintLevel(0);
    setReveal(false);
    setMiss(null);
    setDelta(null);
    setGained(0);
  }

  function commit(success: boolean, currentPuzzle: CompiledPuzzle) {
    const current = progressRef.current;
    if (!current || recorded.current) {
      return;
    }
    recorded.current = true;
    const score = success ? sessionSolvedRef.current + 1 : sessionSolvedRef.current;
    sessionSolvedRef.current = score;
    setSessionSolved(score);
    const next = applyResult(current, {
      id: currentPuzzle.id,
      mode,
      success,
      puzzleRating: currentPuzzle.rating,
      sessionScore: score,
      now: Date.now(),
    });
    progressRef.current = next;
    setProgress(next);
    setDelta(next.rating - current.rating);
    setGained(next.xp - current.xp);
    saveProgress(next);
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
    const next = strikesRef.current + 1;
    strikesRef.current = next;
    setStrikes(next);
    if (next >= RUSH_STRIKES || secondsRef.current <= 0) {
      clearAdvance();
      setSessionOver(true);
      return;
    }
    scheduleRush(900);
  }

  useEffect(() => {
    void (async () => {
    const loaded = loadProgress();
    progressRef.current = loaded;
    sessionSolvedRef.current = 0;
    exclude.current = new Set();
    setProgress(loaded);
    setSessionSolved(0);
    strikesRef.current = 0;
    setStrikes(0);
    setSessionOver(false);
    secondsRef.current = RUSH_SECONDS;
    setSecondsLeft(RUSH_SECONDS);
    const first = pickPuzzle(mode, theme, loaded, 0, exclude.current);
    if (!first) {
      setPuzzle(null);
      return;
    }
    exclude.current.add(first.id);
    recorded.current = false;
    setPuzzle(first);
    setFen(first.fen);
    setPly(0);
    setStatus("playing");
    setLast(null);
    setSelected(null);
    setHintLevel(0);
    setReveal(false);
    setMiss(null);
    setDelta(null);
    setGained(0);
    })();
  }, [mode, theme]);

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

  const orientation = puzzle && new Chess(puzzle.fen).turn() === "b" ? "black" : "white";
  const userTurn = status === "playing" && !sessionOver && ply % 2 === 0;
  const solverMoves = puzzle ? Math.ceil(puzzle.uci.length / 2) : 1;
  const solverIndex = Math.floor(ply / 2) + 1;
  const expected = puzzle && ply < puzzle.uci.length ? puzzle.uci[ply] : undefined;

  const dests = useMemo(() => {
    if (!selected || !userTurn || !fen) {
      return [] as string[];
    }
    try {
      const chess = new Chess(fen);
      if (!/^[a-h][1-8]$/.test(selected)) {
        return [];
      }
      return chess.moves({ square: selected as Square, verbose: true }).map((move) => move.to);
    } catch {
      return [];
    }
  }, [fen, selected, userTurn]);

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
    const current = progressRef.current;
    if (!current || mode === "daily") {
      return;
    }
    const chosen = pickPuzzle(mode, theme, current, sessionSolvedRef.current, exclude.current);
    if (!chosen) {
      return;
    }
    exclude.current.add(chosen.id);
    showPuzzle(chosen);
  }

  function retry() {
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
    const chosen = pickPuzzle(mode, theme, current, 0, exclude.current);
    if (!chosen) {
      return;
    }
    exclude.current.add(chosen.id);
    showPuzzle(chosen);
  }

  const themeStyles = boardSquareStyles(boardTheme);
  const pieces = piecesForSet(pieceSet);
  const squareStyles: Record<string, { backgroundColor?: string; backgroundImage?: string; boxShadow?: string }> = {};
  if (last) {
    const color = status === "failed" && !reveal ? "rgba(239, 68, 68, 0.55)" : "rgba(186, 202, 68, 0.72)";
    squareStyles[last.from] = { backgroundColor: color };
    squareStyles[last.to] = { backgroundColor: color };
  }
  const hintFrom = hintLevel > 0 && userTurn && expected ? expected.slice(0, 2) : "";
  if (hintFrom) {
    squareStyles[hintFrom] = {
      ...(squareStyles[hintFrom] ?? {}),
      backgroundColor: "rgba(234, 179, 8, 0.7)",
    };
  }
  if (selected) {
    squareStyles[selected] = {
      ...(squareStyles[selected] ?? {}),
      boxShadow: "inset 0 0 0 3px rgba(255, 255, 255, 0.55)",
    };
  }
  for (const square of dests) {
    squareStyles[square] = {
      ...(squareStyles[square] ?? {}),
      backgroundImage: "radial-gradient(circle, rgba(0,0,0,0.28) 22%, transparent 23%)",
    };
  }
  const arrowFrom = reveal && miss ? miss.from : hintLevel > 1 && expected ? expected.slice(0, 2) : "";
  const arrowTo = reveal && miss ? miss.to : hintLevel > 1 && expected ? expected.slice(2, 4) : "";
  const arrows =
    arrowFrom && arrowTo
      ? [{ startSquare: arrowFrom, endSquare: arrowTo, color: reveal ? MARK_HEX.G : MARK_HEX.Y }]
      : [];

  const modeLabel =
    mode === "daily" ? "Daily puzzle" : mode === "streak" ? "Streak" : mode === "rush" ? "Rush" : "Rated";
  const continueLabel = mode === "daily" || mode === "rush" || sessionOver ? null : "Next puzzle";
  const sideToMove = orientation === "black" ? "Black" : "White";
  const runStreak = mode === "rush" ? sessionSolved : (progress?.streak ?? 0);
  const level = levelFromXp(progress?.xp ?? 0);
  const bubbleTitle =
    sessionOver && mode === "rush" && secondsLeft === 0
      ? "Time is up"
      : sessionOver && mode === "rush"
        ? "Three misses"
        : sessionOver && status === "failed"
          ? "Streak over"
          : status === "solved"
            ? "Solved"
            : status === "failed"
              ? "Incorrect"
              : `${sideToMove} to move`;
  const solvedLabel = `${sessionSolved} puzzle${sessionSolved === 1 ? "" : "s"} solved`;
  const bubbleBody =
    sessionOver && mode === "rush"
      ? solvedLabel
      : status === "solved"
        ? solvedPraise(runStreak)
        : reveal && miss
          ? `Best move: ${miss.san}`
          : status === "failed"
            ? "Look at the marked move."
            : hintLevel > 1 && userTurn
              ? "The move is marked."
              : hintLevel === 1 && userTurn
                ? "The piece to move is highlighted."
                : userTurn
                  ? puzzle
                    ? puzzleGoal(puzzle.themes)
                    : "Find the best move."
                  : "Best move. Keep going.";

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-studio-bg">
      <CourseChrome />
      {!progress || !puzzle || !fen ? (
        <main className="px-6 py-10 text-body text-studio-muted">Loading puzzle…</main>
      ) : (
        <div className="mx-auto grid min-h-0 w-full max-w-5xl flex-1 grid-rows-[minmax(0,1fr)_auto] gap-3 px-4 py-3 lg:grid-cols-[minmax(0,520px)_minmax(0,1fr)] lg:grid-rows-1 lg:gap-6 lg:py-6">
          <div className="flex h-full min-h-0 w-full items-center justify-center [container-type:size]">
            <div className="relative size-[min(100cqw,100cqh,520px)] overflow-hidden rounded-lg shadow-[0_6px_20px_rgb(0_0_0/0.28)] ring-1 ring-studio-border-strong">
              <Chessboard
                key={`${puzzle.id}-${pieceSet}`}
                options={{
                  id: `puzzle-${puzzle.id}`,
                  position: fen,
                  boardOrientation: orientation,
                  showNotation: showCoordinates,
                  animationDurationInMs: 180,
                  allowDrawingArrows: false,
                  clearArrowsOnClick: false,
                  clearArrowsOnPositionChange: false,
                  arrows,
                  lightSquareStyle: themeStyles.light,
                  darkSquareStyle: themeStyles.dark,
                  squareStyles,
                  pieces,
                  boardStyle: { width: "100%", height: "100%", borderRadius: 8, overflow: "hidden" },
                  canDragPiece: ({ piece }) => {
                    if (!userTurn) {
                      return false;
                    }
                    const color = piece.pieceType.startsWith("w") ? "w" : "b";
                    return color === (orientation === "black" ? "b" : "w");
                  },
                  onPieceDrop: ({ sourceSquare, targetSquare }) => {
                    if (!targetSquare) {
                      return false;
                    }
                    return onDrop(sourceSquare, targetSquare);
                  },
                  onSquareClick: ({ square, piece }) => {
                    if (!userTurn) {
                      return;
                    }
                    if (selected && dests.includes(square)) {
                      onDrop(selected, square);
                      return;
                    }
                    if (piece) {
                      const color = piece.pieceType.startsWith("w") ? "w" : "b";
                      if (color === (orientation === "black" ? "b" : "w")) {
                        setSelected(square);
                        return;
                      }
                    }
                    setSelected(null);
                  },
                }}
              />
              {status === "solved" && gained > 0 && last ? (
                <Award square={last.to} orientation={orientation} points={gained} />
              ) : null}
            </div>
          </div>

          <section className="flex max-h-[min(48dvh,420px)] min-h-40 flex-col overflow-hidden rounded-xl border border-studio-border bg-studio-chrome lg:max-h-[calc(100dvh-8rem)] lg:min-h-0">
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <h1 className="flex items-center gap-2 text-body font-semibold text-studio-fg">
                <span className="inline-flex items-center gap-1 rounded-full bg-studio-hover px-2 py-0.5 tabular-nums">
                  <Crown className="size-3.5 text-studio-warning-fg" aria-hidden />
                  {level.level}
                </span>
                {modeLabel}
                {theme ? ` · ${THEME_LABELS[theme]}` : ""}
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
                <span className="text-caption tabular-nums text-studio-muted">Puzzle {puzzle.rating}</span>
              )}
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-4" aria-live="polite">
              <div className="rounded-xl bg-studio-hover px-4 py-3">
                <p className="text-body font-semibold text-studio-fg">{bubbleTitle}</p>
                <p className="mt-1 text-body text-studio-muted">{bubbleBody}</p>
                {solverMoves > 1 && status === "playing" && !sessionOver ? (
                  <p className="mt-1 text-caption text-studio-muted">
                    Move {Math.min(solverIndex, solverMoves)} of {solverMoves}
                  </p>
                ) : null}
                {sessionOver && mode === "rush" && reveal && miss ? (
                  <p className="mt-1 text-caption text-studio-muted">Best move: {miss.san}</p>
                ) : null}
              </div>

              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-3xl font-semibold tabular-nums leading-none text-studio-fg">
                    {mode === "rush" ? sessionSolved : progress.xp}
                    {mode !== "rush" && status === "solved" && gained > 0 ? (
                      <span className="ml-2 text-title text-studio-success">+{gained}</span>
                    ) : null}
                  </p>
                  {mode === "rush" ? <p className="mt-1 text-caption text-studio-muted">Solved</p> : null}
                </div>
                {mode === "rush" ? (
                  <p className="flex items-center gap-1" aria-label={`${strikes} of ${RUSH_STRIKES} misses`}>
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
                  Rating <span className="tabular-nums text-studio-fg">{progress.rating}</span>
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
                    ? `Best ${progress.rushBest}`
                    : `${sessionSolved} in a row · best ${progress.bestStreak}`}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-2 border-t border-studio-border p-3">
              {userTurn ? (
                <div className="flex gap-2">
                  <Button className="flex-1" onClick={() => setHintLevel((current) => Math.min(2, current + 1))} disabled={hintLevel >= 2}>
                    Hint
                  </Button>
                  <Button onClick={giveUp}>Solution</Button>
                </div>
              ) : null}
              {status !== "playing" && continueLabel ? (
                <Button variant="primary" className="w-full" onClick={nextPuzzle}>
                  <Check className="size-4" aria-hidden />
                  {continueLabel}
                  <ChevronRight className="size-4" aria-hidden />
                </Button>
              ) : null}
              {sessionOver ? (
                <Button variant="primary" className="w-full" onClick={retry}>
                  {mode === "rush" ? "Play again" : "Try again"}
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
                {status !== "playing" && mode === "daily" ? "Back to puzzles" : "Puzzles"}
              </Link>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function Award({
  square,
  orientation,
  points,
}: {
  square: string;
  orientation: "white" | "black";
  points: number;
}) {
  const anchor = squareAnchor(square, orientation);
  if (!anchor) {
    return null;
  }
  return (
    <span
      className="pointer-events-none absolute z-10 rounded-full bg-studio-success px-2 py-0.5 text-caption font-semibold text-white"
      style={{
        left: `${anchor.x * 100}%`,
        top: `${anchor.y * 100}%`,
        animation: "puzzle-award 900ms ease-out forwards",
      }}
    >
      +{points}
    </span>
  );
}
