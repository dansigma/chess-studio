// SIG-1235: end-of-session summary model. Pure: the session hook collects the
// attempts and the progress snapshots, this module turns them into the numbers
// and keys the summary cards render. No clock, no randomness, so the same
// session always produces the same summary (including the encouraging line).
import type { PuzzleStringKey } from "@/src/i18n/puzzle-strings";
import { dayStreak, localDayKey } from "./activity";
import type { StudioPuzzle } from "./studio-handoff";
import type { PuzzleMode, PuzzleProgress } from "./types";
import type { XpResult } from "./use-puzzle-scoring";
import { levelFromXp, type LevelProgress, type XpBreakdown } from "./xp";

/** One committed puzzle attempt of the current session. */
export type SessionAttempt = {
  success: boolean;
  /** Solved without any hint (a wrong move ends the puzzle, so no hint == first try). */
  firstTry: boolean;
  /** Time from showing the puzzle to the attempt, in ms; null when the clock was never stamped (SIG-1250). */
  ms: number | null;
  /** Timestamp of the attempt; the last one decides which local day "today" is. */
  at: number;
  /** SIG-1245: the puzzle played, for the list and the "Analyze in Studio" action. */
  puzzle: StudioPuzzle;
  /** SIG-1245: the XP the attempt scored and whether it was actually added. */
  xp: XpResult;
};

/** SIG-1245: the list shows the last N puzzles; a toggle reveals the rest. */
export const SUMMARY_LIST_LIMIT = 10;

export type SummaryPuzzleRow = {
  /** 1-based position in the session. */
  number: number;
  puzzle: StudioPuzzle;
  success: boolean;
  breakdown: XpBreakdown;
  /** Mistakes practice (or a repeated daily) never adds XP. */
  practiceOnly: boolean;
};

export type SummaryCardId = "did" | "level" | "rating";

export type CheerBucket = "perfect" | "good" | "tough";

export const CHEER_KEYS: Record<CheerBucket, readonly [PuzzleStringKey, PuzzleStringKey, PuzzleStringKey]> = {
  perfect: ["puzzle.summary.cheer.perfect.0", "puzzle.summary.cheer.perfect.1", "puzzle.summary.cheer.perfect.2"],
  good: ["puzzle.summary.cheer.good.0", "puzzle.summary.cheer.good.1", "puzzle.summary.cheer.good.2"],
  tough: ["puzzle.summary.cheer.tough.0", "puzzle.summary.cheer.tough.1", "puzzle.summary.cheer.tough.2"],
};

export type SummaryBestLine =
  | { kind: "rush"; best: number }
  | { kind: "streak"; solved: number; best: number };

export type SessionSummary = {
  mode: PuzzleMode;
  cards: SummaryCardId[];
  attempts: number;
  solved: number;
  failed: number;
  firstTry: number;
  trainingMs: number;
  /** Average ms per puzzle; null with no attempts. */
  avgMs: number | null;
  /** Whole percent solved; null with no attempts. */
  accuracy: number | null;
  cheerBucket: CheerBucket;
  cheerKey: PuzzleStringKey;
  bestLine: SummaryBestLine | null;
  /** The day streak after the session, only when it grew since the session started. */
  dayStreak: number | null;
  level: {
    xpEarned: number;
    /** Mistakes practice never adds XP (SIG-1097); the card says so. */
    practiceOnly: boolean;
    before: LevelProgress;
    after: LevelProgress;
    levelUp: boolean;
  };
  rating: { before: number; after: number; change: number } | null;
  /** SIG-1245: every puzzle of the session, in play order. */
  rows: SummaryPuzzleRow[];
};

/** The rows to render: all of them, or only the last SUMMARY_LIST_LIMIT. */
export function visibleRows(rows: readonly SummaryPuzzleRow[], showAll: boolean): SummaryPuzzleRow[] {
  return showAll ? [...rows] : rows.slice(-SUMMARY_LIST_LIMIT);
}

/** SIG-1256: an unrated (difficulty) session has no rating card. */
export function cardsForMode(mode: PuzzleMode, unrated = false): SummaryCardId[] {
  return mode === "rated" && !unrated ? ["did", "level", "rating"] : ["did", "level"];
}

export function cheerBucket(solved: number, failed: number): CheerBucket {
  const attempts = solved + failed;
  if (solved > 0 && failed === 0) {
    return "perfect";
  }
  return attempts > 0 && solved / attempts >= 0.5 ? "good" : "tough";
}

/** Deterministic variant: the same session data always picks the same line. */
export function cheerKeyFor(solved: number, failed: number, firstTry: number): PuzzleStringKey {
  const bucket = cheerBucket(solved, failed);
  const variants = CHEER_KEYS[bucket];
  return variants[(solved + failed * 2 + firstTry * 4) % variants.length] ?? variants[0];
}

export function buildSessionSummary({
  mode,
  attempts,
  before,
  after,
  unrated = false,
}: {
  mode: PuzzleMode;
  attempts: readonly SessionAttempt[];
  /** Progress when the session started. */
  before: PuzzleProgress;
  /** Progress now. */
  after: PuzzleProgress;
  /** SIG-1256: difficulty session; the rating is neither shown nor compared. */
  unrated?: boolean;
}): SessionSummary {
  const solved = attempts.filter((attempt) => attempt.success).length;
  const failed = attempts.length - solved;
  const firstTry = attempts.filter((attempt) => attempt.success && attempt.firstTry).length;
  // SIG-1250: untimed attempts (ms: null) contribute no time and are excluded
  // from the average denominator; all-untimed means no average.
  const timed = attempts.filter((attempt) => typeof attempt.ms === "number" && Number.isFinite(attempt.ms));
  const trainingMs = timed.reduce((total, attempt) => total + Math.max(0, attempt.ms ?? 0), 0);
  const practiceOnly = mode === "mistakes";
  const levelBefore = levelFromXp(before.xp);
  const levelAfter = levelFromXp(after.xp);
  const lastAt = attempts.length > 0 ? attempts[attempts.length - 1].at : null;
  // Same rule as the heatmap: the streak counts today's activity once it exists.
  const streakBefore = lastAt === null ? 0 : dayStreak(before.days, localDayKey(lastAt)).current;
  const streakAfter = lastAt === null ? 0 : dayStreak(after.days, localDayKey(lastAt)).current;
  return {
    mode,
    cards: cardsForMode(mode, unrated),
    attempts: attempts.length,
    solved,
    failed,
    firstTry,
    trainingMs,
    avgMs: timed.length > 0 ? trainingMs / timed.length : null,
    accuracy: attempts.length > 0 ? Math.round((solved / attempts.length) * 100) : null,
    cheerBucket: cheerBucket(solved, failed),
    cheerKey: cheerKeyFor(solved, failed, firstTry),
    bestLine:
      mode === "rush"
        ? { kind: "rush", best: after.rushBest }
        : mode === "streak"
          ? { kind: "streak", solved, best: after.bestStreak }
          : null,
    dayStreak: streakAfter > streakBefore ? streakAfter : null,
    level: {
      xpEarned: practiceOnly ? 0 : Math.max(0, after.xp - before.xp),
      practiceOnly,
      before: levelBefore,
      after: levelAfter,
      levelUp: levelAfter.level > levelBefore.level,
    },
    rows: attempts.map((attempt, index) => ({
      number: index + 1,
      puzzle: attempt.puzzle,
      success: attempt.success,
      breakdown: attempt.xp.breakdown,
      practiceOnly: practiceOnly || (!attempt.xp.awarded && attempt.xp.breakdown.total > 0),
    })),
    rating: mode === "rated" && !unrated ? { before: before.rating, after: after.rating, change: after.rating - before.rating } : null,
  };
}

/**
 * When does the session end? rated: the user finishes it; streak: the first
 * miss; rush: the timer or the third miss; daily: right after the puzzle;
 * mistakes: the queue runs out or the user finishes. A pool that runs dry
 * ends any session that has attempts. A failed puzzle waits for its reveal so
 * the player still sees the best move on the board first.
 */
export function summaryVisible({
  mode,
  attempts,
  finished,
  sessionOver,
  status,
  reveal,
  caughtUp,
  exhausted,
}: {
  mode: PuzzleMode;
  attempts: number;
  finished: boolean;
  sessionOver: boolean;
  status: "playing" | "solved" | "failed";
  reveal: boolean;
  caughtUp: boolean;
  exhausted: boolean;
}): boolean {
  const settled = status !== "failed" || reveal;
  if (attempts > 0 && exhausted) {
    return true;
  }
  if (mode === "streak" || mode === "rush") {
    return sessionOver && settled;
  }
  if (attempts === 0) {
    return false;
  }
  if (mode === "daily") {
    return status !== "playing" && settled;
  }
  if (mode === "mistakes") {
    return finished || caughtUp;
  }
  return finished;
}
