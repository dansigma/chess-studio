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

/**
 * SIG-1224: most lines the review ever asks for. Pass 1 searches every position
 * with 1 line; pass 2 re-searches with 2 lines only where the played move was the
 * engine's best, because the 2nd line only matters for great/brilliant. The
 * 3rd line is no longer searched.
 */
export const REVIEW_LINES = 2;
export const REVIEW_PASS1_LINES = 1;

/**
 * Order in which each worker walks its contiguous chunk of the line. "reverse"
 * (later positions first) lets the hash of later positions serve earlier ones.
 * `NEXT_PUBLIC_REVIEW_CHUNK_ORDER` is a test-only override.
 */
export type ReviewChunkOrder = "forward" | "reverse";
export function reviewChunkOrder(
  forced: string | undefined = typeof process === "undefined" ? undefined : process.env.NEXT_PUBLIC_REVIEW_CHUNK_ORDER,
): ReviewChunkOrder {
  return forced === "forward" ? "forward" : "reverse";
}

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
  /**
   * SIG-1224: worker affinity. Searches that share a `lane` run on the same worker
   * in call order, so its hash stays warm; the pipeline sets `fresh` only on a
   * lane's first search. Engines without workers ignore it.
   */
  lane?: number;
};

/**
 * Engine seam. `analyze` is called for up to `concurrency` positions at a time
 * (one by default) and resolves with the best result so far (null when nothing was produced, e.g. cancelled or
 * timed out before the first snapshot).
 */
export type ReviewEngine = {
  analyze(fen: string, options: AnalyzeOptions): Promise<PositionEval | null>;
  /**
   * How many `analyze` calls the engine can run at once (default 1: strictly
   * sequential). The scoring pass keeps up to this many positions in flight.
   */
  concurrency?: number;
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
  /** Walk order inside each worker's chunk; defaults to `reviewChunkOrder()` (reverse). */
  chunkOrder?: ReviewChunkOrder;
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

  // Index-aligned, so positions scored out of order by concurrent workers
  // land where the grading below expects them.
  const scores: Array<PositionScore | null> = new Array<PositionScore | null>(total).fill(null);
  // A length mismatch means the resume does not line up with this line: ignore it.
  const resume = input.resume?.length === total ? input.resume : undefined;
  const partialSoFar = (): ReviewPartial => [...scores];
  const scoreOf = (evaluation: PositionEval | null, lines: 1 | 2): PositionScore | null => {
    const score = evaluation ? toPositionScore(evaluation) : null;
    return score ? { ...score, searchedLines: lines } : null;
  };
  const legalCounts = new Map<number, number>();
  const legalAt = (index: number): number => {
    let count = legalCounts.get(index);
    if (count === undefined) {
      count = legalMoveCount(fens[index]);
      legalCounts.set(index, count);
    }
    return count;
  };

  // SIG-1224: each worker ("lane") owns one contiguous chunk of the line, so the
  // assignment (and with it every worker's search sequence and hash contents) is a
  // pure function of the line and the pool size: two runs give the same labels.
  // Pass 1 scores the chunk with 1 line; pass 2 re-searches, with 2 lines, the
  // positions where the played move was pass 1's best (the only ones where the
  // 2nd line can change a label). The hash is cleared once per lane, on its first
  // search, and kept for the rest of the review.
  const concurrency = Math.max(1, Math.min(total, Math.floor(engine.concurrency ?? 1)));
  const chunkSize = Math.ceil(total / concurrency);
  const reverse = (input.chunkOrder ?? reviewChunkOrder()) === "reverse";
  // Positions finished in pass 1 / pass 2, and the pass 2 positions known so far.
  let finished = 0;
  let pass2Done = 0;
  const lanePass2: number[] = new Array<number>(concurrency).fill(-1);
  const laneSize: number[] = new Array<number>(concurrency).fill(0);
  let lastDone = 0;
  // Consecutive pass 1 positions without any engine result, counted in completion
  // order: a success anywhere resets it, so one slow worker cannot trip the give-up
  // by itself, and a dead engine (every worker returning null) still trips after
  // MAX_CONSECUTIVE_MISSES completions without waiting on the slowest in-flight search.
  let misses = 0;
  let gaveUp = false;
  let signalGaveUp: () => void = () => undefined;
  const gaveUpSignal = new Promise<void>((resolve) => {
    signalGaveUp = resolve;
  });
  // Progress covers both passes: pass 2 is estimated at half a chunk until a
  // lane has finished pass 1 and knows its exact count. Never goes backwards.
  const reportProgress = () => {
    let expected2 = 0;
    for (let lane = 0; lane < concurrency; lane += 1) {
      expected2 += lanePass2[lane] >= 0 ? lanePass2[lane] : Math.round(laneSize[lane] / 2);
    }
    const share = (finished + pass2Done) / (total + expected2);
    lastDone = Math.max(lastDone, Math.min(total - 1, Math.floor(share * total)));
    const done = finished >= total && pass2Done >= expected2 ? total : lastDone;
    input.onProgress?.({ done, total, elapsedMs: now() - startedAt });
  };
  for (let lane = 0; lane < concurrency; lane += 1) {
    laneSize[lane] = Math.max(0, Math.min(total, (lane + 1) * chunkSize) - lane * chunkSize);
  }
  reportProgress();

  const runLane = async (lane: number): Promise<void> => {
    const start = lane * chunkSize;
    const end = Math.min(total, start + chunkSize);
    const indices: number[] = [];
    for (let index = start; index < end; index += 1) {
      indices.push(index);
    }
    if (reverse) {
      indices.reverse();
    }
    // The first real search of the lane clears this worker's hash.
    let fresh = true;
    const search = async (index: number, lines: number): Promise<PositionEval | null> => {
      const options: AnalyzeOptions = {
        depth,
        lines,
        timeoutMs: POSITION_TIMEOUT_MS,
        fresh,
        legalMoves: legalAt(index),
        lane,
      };
      fresh = false;
      let evaluation = await engine.analyze(fens[index], options);
      if (!evaluation && !cancelled() && !gaveUp) {
        // One extra search (with a cleared hash) before counting a miss: restarts
        // already ran inside the first analyze; this covers a single dropped result.
        evaluation = await engine.analyze(fens[index], { ...options, fresh: true });
      }
      return evaluation;
    };

    // Pass 1: every position, 1 line.
    for (const index of indices) {
      if (gaveUp || cancelled()) {
        return;
      }
      const carried = resume?.[index];
      if (carried && carried.depth === depth && carried.searchedLines !== undefined) {
        scores[index] = carried;
        misses = 0;
        finished += 1;
        reportProgress();
        continue;
      }
      const evaluation = await search(index, REVIEW_PASS1_LINES);
      scores[index] = scoreOf(evaluation, 1);
      finished += 1;
      misses = evaluation ? 0 : misses + 1;
      if (misses >= MAX_CONSECUTIVE_MISSES && !cancelled()) {
        gaveUp = true;
        signalGaveUp();
        return;
      }
      reportProgress();
    }

    // Pass 2: 2 lines where the played move was pass 1's best. The result replaces
    // the pass 1 score as a whole (best line and 2nd line from one search), so a
    // different best move found at 2 lines is graded consistently.
    const needsSecond = (index: number): boolean => {
      const score = scores[index];
      return (
        score != null &&
        score.searchedLines === 1 &&
        index < moves.length &&
        score.bestUci != null &&
        score.bestUci === moves[index].uci &&
        legalAt(index) > 1
      );
    };
    const second = indices.filter(needsSecond);
    lanePass2[lane] = second.length;
    reportProgress();
    for (const index of second) {
      if (gaveUp || cancelled()) {
        return;
      }
      const evaluation = await search(index, REVIEW_LINES);
      if (evaluation && evaluation.lines.length >= REVIEW_LINES) {
        scores[index] = scoreOf(evaluation, 2) ?? scores[index];
      }
      pass2Done += 1;
      reportProgress();
    }
  };
  await Promise.race([Promise.all(Array.from({ length: concurrency }, (_, lane) => runLane(lane))), gaveUpSignal]);
  if (gaveUp) {
    return { status: "failed", partial: partialSoFar() };
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
