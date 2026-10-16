import { Chess } from "chess.js";
import { isNullMoveToken } from "./null-move.ts";
import { dividePhases, phaseAt } from "./phases.ts";
import { volatilityWeights, whiteWinChance } from "./review-accuracy.ts";
import type { ReportRow } from "./review-report.ts";
import {
  bookFlags,
  gradeMove,
  hangsPieceOn,
  isSacrificeOn,
  lineHolds,
  mergeBookLabel,
  type PositionScore,
} from "./review.ts";

/** Lines analysed for every position; the 2nd/3rd scores drive "only move" detection. */
export const REVIEW_LINES = 3;

export const REVIEW_PRESETS = {
  fast: { label: "Fast", depth: 10 },
  standard: { label: "Standard", depth: 12 },
  deep: { label: "Deep", depth: 16 },
} as const;

export type ReviewPreset = keyof typeof REVIEW_PRESETS;
export const DEFAULT_REVIEW_PRESET: ReviewPreset = "standard";

export const POSITION_TIMEOUT_MS = 25_000;
const RECHECK_EXTRA_DEPTH = 6;
const RECHECK_MIN_EXTRA_DEPTH = 4;
const RECHECK_TIMEOUT_MS = 12_000;

/** One scored line, always from White's point of view (pawns). */
export type EvalLine = {
  whitePawns: number;
  uci: string | null;
  /** Full continuation in UCI (best move first); defaults to just `uci`. */
  pv?: string[];
};

export type PositionEval = {
  depth: number;
  /** Best line first. */
  lines: EvalLine[];
};

export type AnalyzeOptions = {
  depth: number;
  lines: number;
  timeoutMs: number;
  /**
   * Clears the engine hash before the search. The pipeline sets it on every call so a
   * position's score never depends on what was searched before it (Show threat, restarts).
   */
  fresh: boolean;
  /** Legal moves in the position; lets the adapter tell a cut-short search from a legitimately short one. */
  legalMoves?: number;
};

/**
 * Engine seam. `analyze` is awaited one position at a time and resolves with
 * the best result so far (null when nothing was produced, e.g. cancelled or
 * timed out before the first snapshot).
 */
export type ReviewEngine = {
  analyze(fen: string, options: AnalyzeOptions): Promise<PositionEval | null>;
};

export type ReviewMove = { uci: string };

/** A graded move; `index` is the 0-based position of the move in the reviewed line. */
export type ReviewRow = ReportRow & {
  index: number;
  /** The move that was played (UCI). */
  playedUci: string;
  /** Engine continuation from the position before the move, best move first (UCI). */
  bestPv: string[];
  /** White-perspective evaluations (pawns) of the best line before the move and of the position after it. */
  beforePawns: number;
  afterPawns: number;
};

export type ReviewProgress = {
  done: number;
  total: number;
  elapsedMs: number;
};

export type ReviewInput = {
  /** FENs of the reviewed line, start position first (moves + 1 entries). */
  fens: string[];
  moves: ReviewMove[];
  preset: ReviewPreset;
  engine: ReviewEngine;
  /** Masters replies per ply, as returned by the opening explorer (null = unknown). */
  bookReplies?: () => Promise<Array<readonly string[] | null>>;
  isCancelled?: () => boolean;
  onProgress?: (progress: ReviewProgress) => void;
  now?: () => number;
  /**
   * Scores from an earlier cancelled/failed run, position-indexed like `fens`.
   * Entries that are present and depth-match the preset are reused without an
   * engine call; holes and depth mismatches are rescored. A length mismatch is
   * ignored defensively (treated as a fresh run).
   */
  resume?: Array<PositionScore | null>;
};

/** Consecutive positions without any engine result after which the run gives up. */
export const MAX_CONSECUTIVE_MISSES = 3;

export type ReviewPartial = Array<PositionScore | null>;

export type ReviewOutcome =
  | { status: "done"; rows: ReviewRow[] }
  | { status: "cancelled"; partial: ReviewPartial }
  /** The engine stopped answering; grading further positions would only wait on timeouts. */
  | { status: "failed"; partial: ReviewPartial };

function legalMoveCount(fen: string): number {
  try {
    return new Chess(fen).moves().length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function sideOf(fen: string): "w" | "b" {
  return fen.split(" ")[1] === "b" ? "b" : "w";
}

export function toPositionScore(evaluation: PositionEval): PositionScore | null {
  const best = evaluation.lines[0];
  if (!best) {
    return null;
  }
  return {
    whitePawns: best.whitePawns,
    bestUci: best.uci,
    bestPv: best.pv ?? (best.uci ? [best.uci] : []),
    secondWhitePawns: evaluation.lines[1]?.whitePawns ?? null,
    thirdWhitePawns: evaluation.lines[2]?.whitePawns ?? null,
    depth: evaluation.depth,
  };
}

/** Remaining time from the measured per-position pace; null until something was measured. */
export function estimateRemainingMs(progress: ReviewProgress): number | null {
  if (progress.done <= 0 || progress.elapsedMs <= 0) {
    return null;
  }
  return Math.round((progress.elapsedMs / progress.done) * (progress.total - progress.done));
}

/** Win-chance weights per move, from every position's white win chance (unscored positions repeat the last one). */
export function moveWeights(scores: Array<PositionScore | null>): number[] {
  let last = 50;
  const chances = scores.map((score) => {
    if (score) {
      last = whiteWinChance(score.whitePawns);
    }
    return last;
  });
  return volatilityWeights(chances);
}

/**
 * Pure grading of already-scored positions for the resume preview (SIG-966).
 * No engine calls, no book labels (explorer replies are only fetched during a
 * run) and no sacrifice recheck — the finished run re-grades everything from
 * the full score array, so the preview is explicitly labelled partial.
 */
export function gradePreviewRows(
  fens: string[],
  moves: ReviewMove[],
  scores: Array<PositionScore | null>,
): ReviewRow[] {
  const division = dividePhases(fens);
  const weights = moveWeights(scores);
  const rows: ReviewRow[] = [];
  // Win-chance points the previous mover lost; feeds "miss" detection.
  let lastWinLoss = 0;
  for (let index = 0; index < moves.length; index += 1) {
    const before = scores[index];
    const after = scores[index + 1];
    const uci = moves[index].uci;
    if (!before || !after || uci.length < 4 || isNullMoveToken(uci)) {
      lastWinLoss = 0;
      continue;
    }
    const beforeBoard = new Chess(fens[index]);
    const afterBoard = new Chess(fens[index + 1]);
    const side = sideOf(fens[index]);
    const forced = beforeBoard.moves().length === 1;
    const hanging = hangsPieceOn(beforeBoard, afterBoard, uci, side);
    const sacrifice = isSacrificeOn(beforeBoard, afterBoard, side) || hanging;
    const graded = gradeMove({
      side,
      playedUci: uci,
      before,
      afterWhitePawns: after.whitePawns,
      sacrifice,
      opponentLastLoss: lastWinLoss,
    });
    lastWinLoss = graded.winLoss;
    rows.push({
      ...graded,
      // A forced move has no alternative: it is labelled `forced` instead of a tier.
      label: forced ? "forced" : graded.label,
      index,
      playedUci: uci,
      side,
      phase: phaseAt(division, index + 1),
      forced,
      weight: weights[index],
      bestPv: before.bestPv ?? [],
      beforePawns: before.whitePawns,
      afterPawns: after.whitePawns,
    });
  }
  return rows;
}

export async function runReview(input: ReviewInput): Promise<ReviewOutcome> {
  const { fens, moves, engine } = input;
  const depth = REVIEW_PRESETS[input.preset].depth;
  const now = input.now ?? Date.now;
  const cancelled = () => input.isCancelled?.() ?? false;
  const startedAt = now();
  const total = fens.length;

  // Book lookups run alongside the analysis; they never overlap engine calls.
  const bookPromise = input.bookReplies?.().catch(() => []) ?? Promise.resolve([]);

  const scores: Array<PositionScore | null> = [];
  let misses = 0;
  // A length mismatch means the resume does not line up with this line: ignore it.
  const resume = input.resume?.length === total ? input.resume : undefined;
  const partialSoFar = (): ReviewPartial => {
    const partial: ReviewPartial = [...scores];
    while (partial.length < total) {
      partial.push(null);
    }
    return partial;
  };
  const analyzeOptions = (fen: string): AnalyzeOptions => ({
    depth,
    lines: REVIEW_LINES,
    timeoutMs: POSITION_TIMEOUT_MS,
    fresh: true,
    legalMoves: legalMoveCount(fen),
  });
  for (let index = 0; index < total; index += 1) {
    if (cancelled()) {
      return { status: "cancelled", partial: partialSoFar() };
    }
    input.onProgress?.({ done: index, total, elapsedMs: now() - startedAt });
    const carried = resume?.[index];
    if (carried && carried.depth === depth) {
      scores.push(carried);
      misses = 0;
      continue;
    }
    let evaluation = await engine.analyze(fens[index], analyzeOptions(fens[index]));
    if (!evaluation && !cancelled()) {
      // One extra fresh search before counting a miss (lease restarts already
      // ran inside the first analyze; this covers a single dropped result).
      evaluation = await engine.analyze(fens[index], analyzeOptions(fens[index]));
    }
    scores.push(evaluation ? toPositionScore(evaluation) : null);
    misses = evaluation ? 0 : misses + 1;
    if (misses >= MAX_CONSECUTIVE_MISSES && !cancelled()) {
      return { status: "failed", partial: partialSoFar() };
    }
  }
  if (cancelled()) {
    return { status: "cancelled", partial: partialSoFar() };
  }
  input.onProgress?.({ done: total, total, elapsedMs: now() - startedAt });

  const replies = await bookPromise;
  if (cancelled()) {
    return { status: "cancelled", partial: partialSoFar() };
  }
  const inBook = bookFlags(
    moves.map((move) => move.uci),
    replies,
  );
  const division = dividePhases(fens);
  const weights = moveWeights(scores);
  const rows: ReviewRow[] = [];
  // Win-chance points the previous mover lost; feeds "miss" detection.
  let lastWinLoss = 0;

  for (let index = 0; index < moves.length; index += 1) {
    const before = scores[index];
    const after = scores[index + 1];
    const uci = moves[index].uci;
    if (!before || !after || uci.length < 4 || isNullMoveToken(uci)) {
      lastWinLoss = 0;
      continue;
    }
    const beforeBoard = new Chess(fens[index]);
    const afterBoard = new Chess(fens[index + 1]);
    const side = sideOf(fens[index]);
    const forced = beforeBoard.moves().length === 1;
    const hanging = hangsPieceOn(beforeBoard, afterBoard, uci, side);
    const sacrifice = isSacrificeOn(beforeBoard, afterBoard, side) || hanging;

    let beforePawns = before.whitePawns;
    let afterPawns = after.whitePawns;
    let bestPv = before.bestPv ?? [];
    let graded = gradeMove({
      side,
      playedUci: uci,
      before,
      afterWhitePawns: after.whitePawns,
      sacrifice,
      opponentLastLoss: lastWinLoss,
    });
    const negative =
      graded.label === "inaccuracy" || graded.label === "mistake" || graded.label === "miss" || graded.label === "blunder";
    if (!forced && negative && sacrifice && !cancelled()) {
      const deeper = await engine.analyze(fens[index + 1], {
        depth: depth + RECHECK_EXTRA_DEPTH,
        lines: 1,
        timeoutMs: RECHECK_TIMEOUT_MS,
        fresh: true,
        legalMoves: legalMoveCount(fens[index + 1]),
      });
      if (deeper && deeper.depth >= depth + RECHECK_MIN_EXTRA_DEPTH && deeper.lines[0] && lineHolds(side, before.whitePawns, deeper.lines[0].whitePawns)) {
        beforePawns = deeper.lines[0].whitePawns;
        afterPawns = deeper.lines[0].whitePawns;
        bestPv = [uci];
        graded = gradeMove({
          side,
          playedUci: uci,
          before: { whitePawns: deeper.lines[0].whitePawns, bestUci: uci, secondWhitePawns: before.whitePawns },
          afterWhitePawns: deeper.lines[0].whitePawns,
          sacrifice: true,
          opponentLastLoss: lastWinLoss,
        });
      }
    }
    if (cancelled()) {
      return { status: "cancelled", partial: partialSoFar() };
    }
    lastWinLoss = graded.winLoss;
    rows.push({
      ...graded,
      // A forced move has no alternative: it is labelled `forced` instead of a tier.
      label: forced ? "forced" : mergeBookLabel(inBook[index], graded.label),
      index,
      playedUci: uci,
      side,
      phase: phaseAt(division, index + 1),
      forced,
      weight: weights[index],
      bestPv,
      beforePawns,
      afterPawns,
    });
  }
  return { status: "done", rows };
}
