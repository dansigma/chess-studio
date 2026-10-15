"use client";

import { useMemo } from "react";
import { Chess, type Square } from "chess.js";
import { MARK_HEX } from "@/src/chess/marks";
import { levelFromXp, type CompiledPuzzle } from "./engine";
import { puzzleGoal, solvedPraise } from "./feedback";
import type { PuzzleMode, PuzzleTheme } from "./types";
import type { Miss, PuzzleSession, Status } from "./use-puzzle-session";

export type SquareStyle = { backgroundColor?: string; backgroundImage?: string; boxShadow?: string };
export type BoardArrow = { startSquare: string; endSquare: string; color: string };

export function orientationFor(puzzle: CompiledPuzzle | null): "white" | "black" {
  return puzzle && new Chess(puzzle.fen).turn() === "b" ? "black" : "white";
}

export function solverMovesFor(puzzle: CompiledPuzzle | null): number {
  return puzzle ? Math.ceil(puzzle.uci.length / 2) : 1;
}

export function solverIndexFor(ply: number): number {
  return Math.floor(ply / 2) + 1;
}

export function modeLabelFor(mode: PuzzleMode): string {
  return mode === "daily" ? "Daily puzzle" : mode === "streak" ? "Streak" : mode === "rush" ? "Rush" : "Rated";
}

export function continueLabelFor(mode: PuzzleMode, sessionOver: boolean): string | null {
  return mode === "daily" || mode === "rush" || sessionOver ? null : "Next puzzle";
}

export function solvedCountLabel(sessionSolved: number): string {
  return `${sessionSolved} puzzle${sessionSolved === 1 ? "" : "s"} solved`;
}

export function bubbleCopy({
  mode,
  sessionOver,
  secondsLeft,
  status,
  reveal,
  miss,
  hintLevel,
  userTurn,
  themes,
  runStreak,
  sessionSolved,
  sideToMove,
}: {
  mode: PuzzleMode;
  sessionOver: boolean;
  secondsLeft: number;
  status: Status;
  reveal: boolean;
  miss: Miss | null;
  hintLevel: number;
  userTurn: boolean;
  themes: readonly PuzzleTheme[] | null;
  runStreak: number;
  sessionSolved: number;
  sideToMove: string;
}): { title: string; body: string } {
  const title =
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
  const body =
    sessionOver && mode === "rush"
      ? solvedCountLabel(sessionSolved)
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
                  ? themes
                    ? puzzleGoal(themes)
                    : "Find the best move."
                  : "Best move. Keep going.";
  return { title, body };
}

export function destinationSquares(fen: string, selected: string | null, userTurn: boolean): string[] {
  if (!selected || !userTurn || !fen) {
    return [];
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
}

export function boardHighlights({
  last,
  status,
  reveal,
  hintLevel,
  userTurn,
  expected,
  selected,
  miss,
  dests,
}: {
  last: { from: string; to: string } | null;
  status: Status;
  reveal: boolean;
  hintLevel: number;
  userTurn: boolean;
  expected: string | undefined;
  selected: string | null;
  miss: Miss | null;
  dests: readonly string[];
}): { squareStyles: Record<string, SquareStyle>; arrows: BoardArrow[] } {
  const squareStyles: Record<string, SquareStyle> = {};
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

  return { squareStyles, arrows };
}

export function usePuzzleFeedback({ mode, session }: { mode: PuzzleMode; session: PuzzleSession }) {
  const {
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
    sessionOver,
    secondsLeft,
    userTurn,
    expected,
    progress,
  } = session;

  const dests = useMemo(() => destinationSquares(fen, selected, userTurn), [fen, selected, userTurn]);
  const orientation = orientationFor(puzzle);
  const solverMoves = solverMovesFor(puzzle);
  const solverIndex = solverIndexFor(ply);
  const modeLabel = modeLabelFor(mode);
  const continueLabel = continueLabelFor(mode, sessionOver);
  const sideToMove = orientation === "black" ? "Black" : "White";
  const runStreak = mode === "rush" ? sessionSolved : (progress?.streak ?? 0);
  const level = levelFromXp(progress?.xp ?? 0);
  const { title: bubbleTitle, body: bubbleBody } = bubbleCopy({
    mode,
    sessionOver,
    secondsLeft,
    status,
    reveal,
    miss,
    hintLevel,
    userTurn,
    themes: puzzle ? puzzle.themes : null,
    runStreak,
    sessionSolved,
    sideToMove,
  });
  const { squareStyles, arrows } = boardHighlights({
    last,
    status,
    reveal,
    hintLevel,
    userTurn,
    expected,
    selected,
    miss,
    dests,
  });

  return {
    dests,
    orientation,
    solverMoves,
    solverIndex,
    modeLabel,
    continueLabel,
    sideToMove,
    runStreak,
    level,
    bubbleTitle,
    bubbleBody,
    squareStyles,
    arrows,
  };
}

export type PuzzleFeedback = ReturnType<typeof usePuzzleFeedback>;
