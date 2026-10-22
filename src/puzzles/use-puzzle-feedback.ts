"use client";

import { useMemo } from "react";
import { Chess, type Square } from "chess.js";
import { MARK_HEX } from "@/src/chess/marks";
import type { SiteLocale } from "@/src/i18n/locale";
import { tPuzzle } from "@/src/i18n/puzzle-strings";
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

export function modeLabelFor(mode: PuzzleMode, locale: SiteLocale): string {
  return tPuzzle(locale, mode === "daily" ? "puzzle.mode.daily" : mode === "streak" ? "puzzle.mode.streak" : mode === "rush" ? "puzzle.mode.rush" : "puzzle.mode.rated");
}

export function continueLabelFor(mode: PuzzleMode, sessionOver: boolean, locale: SiteLocale): string | null {
  return mode === "daily" || mode === "rush" || sessionOver ? null : tPuzzle(locale, "puzzle.panel.continue");
}

export function solvedCountLabel(sessionSolved: number, locale: SiteLocale): string {
  return tPuzzle(
    locale,
    sessionSolved === 1 ? "puzzle.feedback.solvedCount.one" : "puzzle.feedback.solvedCount.other",
    { count: sessionSolved },
  );
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
  locale,
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
  locale: SiteLocale;
}): { title: string; body: string } {
  const title =
    sessionOver && mode === "rush" && secondsLeft === 0
      ? tPuzzle(locale, "puzzle.feedback.timeUp")
      : sessionOver && mode === "rush"
        ? tPuzzle(locale, "puzzle.feedback.threeMisses")
        : sessionOver && status === "failed"
          ? tPuzzle(locale, "puzzle.feedback.streakOver")
          : status === "solved"
            ? tPuzzle(locale, "puzzle.feedback.solved")
            : status === "failed"
              ? tPuzzle(locale, "puzzle.feedback.incorrect")
              : tPuzzle(locale, "puzzle.feedback.sideToMove", { side: sideToMove });
  const body =
    sessionOver && mode === "rush"
      ? solvedCountLabel(sessionSolved, locale)
      : status === "solved"
        ? solvedPraise(runStreak, locale)
        : reveal && miss
          ? tPuzzle(locale, "puzzle.panel.bestMove", { san: miss.san })
          : status === "failed"
            ? tPuzzle(locale, "puzzle.feedback.lookAtMarked")
            : hintLevel > 1 && userTurn
              ? tPuzzle(locale, "puzzle.feedback.moveMarked")
              : hintLevel === 1 && userTurn
                ? tPuzzle(locale, "puzzle.feedback.pieceHighlighted")
                : userTurn
                  ? themes
                    ? puzzleGoal(themes, locale)
                    : tPuzzle(locale, "puzzle.feedback.findBest")
                  : tPuzzle(locale, "puzzle.feedback.bestMoveKeepGoing");
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

export function usePuzzleFeedback({
  mode,
  session,
  locale,
}: {
  mode: PuzzleMode;
  session: PuzzleSession;
  locale: SiteLocale;
}) {
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
  const modeLabel = modeLabelFor(mode, locale);
  const continueLabel = continueLabelFor(mode, sessionOver, locale);
  const sideToMove = tPuzzle(locale, orientation === "black" ? "puzzle.side.black" : "puzzle.side.white");
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
    locale,
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
