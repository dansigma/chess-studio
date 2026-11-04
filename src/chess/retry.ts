// SIG-1209: "Retry a mistake in place" — the pure state machine behind the
// Game Review retry. No React, no store, no timers: the store slice owns the
// 600 ms wrong-move flash and the 400 ms reply, this module only decides what
// each event means and what (if anything) to record.
import { Chess } from "chess.js";
import { judgeMove } from "../puzzles/engine";
import type { MistakeExercise } from "./mistake-exercises.ts";
import { exerciseFromRow } from "./mistake-exercises.ts";
import type { ReviewRow } from "./review-engine.ts";
import type { ReviewSide } from "./review-report.ts";
import type { Path } from "./tree.ts";

export type RetryStatus = "thinking" | "wrong" | "continuing" | "solved" | "revealed";
export type RetryOutcome = "correct" | "incorrect";

/** How long a wrong move stays on the board before it reverts. */
export const RETRY_WRONG_FLASH_MS = 600;
/** Delay before the scripted reply of a 3-ply solution auto-plays. */
export const RETRY_REPLY_DELAY_MS = 400;

export type RetryState = {
  exercise: MistakeExercise;
  /** Solution plies applied so far (the solver's moves and the scripted reply). */
  ply: number;
  /** The position the solver sees (never the wrong-move flash position). */
  fen: string;
  status: RetryStatus;
  hintUsed: boolean;
  /** From-square of the expected move while a hint is showing. */
  hintSquare: string | null;
  /** True after the first wrong move. */
  missed: boolean;
  /** A record was already written for this entry (at most one per entry). */
  recorded: boolean;
  /** The last wrong move was the move played in the game. */
  wrongGameMove: boolean;
  /** The solver's move was right and the scripted reply has not played yet. */
  awaitingReply: boolean;
  /** Last move on the board, "e2e4" style; "" when none. */
  lastMove: string;
};

export type RetryFlash = { fen: string; from: string; to: string };

export type RetryMoveResult = {
  retry: RetryState;
  /** False when the move is illegal or the machine is locked: nothing changed. */
  accepted: boolean;
  /** True for a wrong move: show `flash`, then settle back to `retry.fen`. */
  revert: boolean;
  flash: RetryFlash | null;
  /** True when the scripted reply must now auto-play (`playReply`). */
  reply: boolean;
};

function legalLine(fen: string, line: string[]): string | null {
  let board: Chess;
  try {
    board = new Chess(fen);
  } catch {
    return null;
  }
  for (const uci of line) {
    try {
      if (!board.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })) {
        return null;
      }
    } catch {
      return null;
    }
  }
  return board.fen();
}

/**
 * Start a retry on `exercise`, or null when it cannot be one: the solution
 * must be a legal solver-first line (odd length) whose first move differs
 * from the move played in the game.
 */
export function startRetry(exercise: MistakeExercise | null | undefined, lastMove = ""): RetryState | null {
  const line = exercise?.solutionUci;
  if (!exercise || !line || line.length === 0 || line.length % 2 === 0) {
    return null;
  }
  if (line[0] === exercise.playedUci) {
    return null;
  }
  if (legalLine(exercise.fen, line) === null) {
    return null;
  }
  return {
    exercise,
    ply: 0,
    fen: exercise.fen,
    status: "thinking",
    hintUsed: false,
    hintSquare: null,
    missed: false,
    recorded: false,
    wrongGameMove: false,
    awaitingReply: false,
    lastMove,
  };
}

/** The solver's expected move at the current ply, or null when finished. */
export function expectedUci(retry: RetryState): string | null {
  if (retry.status === "solved" || retry.status === "revealed") {
    return null;
  }
  return retry.exercise.solutionUci[retry.ply] ?? null;
}

function isLocked(retry: RetryState): boolean {
  return retry.status === "solved" || retry.status === "revealed" || retry.awaitingReply;
}

const REJECTED = (retry: RetryState): RetryMoveResult => ({
  retry,
  accepted: false,
  revert: false,
  flash: null,
  reply: false,
});

/**
 * The solver moves `from` -> `to`. A correct move is the engine's exact move,
 * or any checkmate when the exercise motif is "mate". A wrong move leaves the
 * solver's position untouched and asks the caller to flash it and revert.
 */
export function applyMove(retry: RetryState, from: string, to: string, promotion?: string): RetryMoveResult {
  const expected = expectedUci(retry);
  if (expected === null || isLocked(retry)) {
    return REJECTED(retry);
  }
  const acceptMate = retry.exercise.motif === "mate";
  const judged = judgeMove(retry.fen, expected, from, to, acceptMate);
  if (judged.kind === "illegal") {
    return REJECTED(retry);
  }
  let kind = judged.kind;
  let { fen, uci } = judged;
  // judgeMove tries every promotion piece; honour the one the solver picked.
  if (promotion && !uci.endsWith(promotion)) {
    const chess = new Chess(retry.fen);
    try {
      const move = chess.move({ from, to, promotion });
      uci = `${move.from}${move.to}${move.promotion ?? ""}`;
      fen = chess.fen();
      kind = uci === expected || (acceptMate && chess.isCheckmate()) ? "correct" : "wrong";
    } catch {
      return REJECTED(retry);
    }
  }
  if (kind === "wrong") {
    return {
      retry: {
        ...retry,
        status: "wrong",
        missed: true,
        wrongGameMove: retry.ply === 0 && uci === retry.exercise.playedUci,
      },
      accepted: true,
      revert: true,
      flash: { fen, from: judged.from, to: judged.to },
      reply: false,
    };
  }
  const solved = retry.ply + 1 >= retry.exercise.solutionUci.length;
  return {
    retry: {
      ...retry,
      ply: retry.ply + 1,
      fen,
      status: solved ? "solved" : "continuing",
      hintSquare: null,
      wrongGameMove: false,
      awaitingReply: !solved,
      lastMove: `${judged.from}${judged.to}`,
    },
    accepted: true,
    revert: false,
    flash: null,
    reply: !solved,
  };
}

/** Plays the scripted reply of a 3-ply solution; no-op unless one is pending. */
export function playReply(retry: RetryState): RetryState {
  if (!retry.awaitingReply) {
    return retry;
  }
  const uci = retry.exercise.solutionUci[retry.ply];
  const chess = new Chess(retry.fen);
  try {
    const move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    return {
      ...retry,
      ply: retry.ply + 1,
      fen: chess.fen(),
      awaitingReply: false,
      lastMove: `${move.from}${move.to}`,
    };
  } catch {
    return { ...retry, awaitingReply: false };
  }
}

/** Highlights the piece to move. Any hint turns the result into a miss. */
export function hint(retry: RetryState): RetryState {
  const expected = expectedUci(retry);
  if (expected === null || retry.awaitingReply) {
    return retry;
  }
  return { ...retry, hintUsed: true, hintSquare: expected.slice(0, 2) };
}

/** Gives up: the board shows the end of the solution line. */
export function reveal(retry: RetryState): RetryState {
  if (retry.status === "solved" || retry.status === "revealed") {
    return retry;
  }
  const chess = new Chess(retry.exercise.fen);
  let lastMove = "";
  for (const uci of retry.exercise.solutionUci) {
    try {
      const move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      lastMove = `${move.from}${move.to}`;
    } catch {
      break;
    }
  }
  return {
    ...retry,
    status: "revealed",
    ply: retry.exercise.solutionUci.length,
    fen: chess.fen(),
    hintSquare: null,
    awaitingReply: false,
    lastMove,
  };
}

/**
 * What to record right now, or null. At most one record per entry, written at
 * the first decisive event:
 * - first wrong move -> incorrect (even if the solver later solves);
 * - solve with no miss and no hint -> correct;
 * - solve after a hint, or reveal -> incorrect;
 * - exit before any decisive event -> nothing.
 */
export function outcomeToRecord(retry: RetryState): RetryOutcome | null {
  if (retry.recorded) {
    return null;
  }
  if (retry.missed) {
    return "incorrect";
  }
  if (retry.status === "solved") {
    return retry.hintUsed ? "incorrect" : "correct";
  }
  if (retry.status === "revealed") {
    return "incorrect";
  }
  return null;
}

export function markRecorded(retry: RetryState): RetryState {
  return retry.recorded ? retry : { ...retry, recorded: true };
}

export type RetryTarget = {
  /** Path of the mistake itself (the key-moment row). */
  momentPath: Path;
  /** Path of the position before the mistake: where the retry board sits. */
  parentPath: Path;
  /** 0-based ply index of the mistake in the reviewed line. */
  index: number;
  exercise: MistakeExercise;
};

/**
 * Every row that can be retried, in game order and for BOTH sides: miss /
 * mistake / blunder, not forced, with a legal solver-first engine line.
 * `parentPaths[row.index]` is the path of the position before that row's move.
 */
export function buildRetryTargets(input: {
  rows: Array<ReviewRow & { path: Path }>;
  fens: string[];
  parentPaths: Path[];
  userSide: ReviewSide;
  now?: Date | string;
}): RetryTarget[] {
  const createdAt =
    input.now instanceof Date ? input.now.toISOString() : (input.now ?? new Date().toISOString());
  const targets: RetryTarget[] = [];
  for (const row of input.rows) {
    const parentPath = input.parentPaths[row.index];
    const exercise = parentPath
      ? exerciseFromRow({ fen: input.fens[row.index], row, userSide: input.userSide, createdAt })
      : null;
    if (exercise && parentPath && startRetry(exercise)) {
      targets.push({ momentPath: row.path, parentPath, index: row.index, exercise });
    }
  }
  return targets.sort((a, b) => a.index - b.index);
}
