import type { VariationProgress } from "./types";

/** Chessable-style ladder: 4 h, 1 d, 3 d, 1 wk, 2 wk, 1 mo, 3 mo. */
export const REVIEW_LADDER_HOURS = [4, 24, 72, 168, 336, 720, 2160] as const;

export const MAX_REVIEW_LEVEL = REVIEW_LADDER_HOURS.length;

export type StudyStatus = "new" | "learned" | "review";

const HOUR_MS = 3_600_000;

function dueAfterLevel(level: number, now: Date): string {
  const hours = REVIEW_LADDER_HOURS[Math.min(Math.max(level, 1), MAX_REVIEW_LEVEL) - 1];
  return new Date(now.getTime() + hours * HOUR_MS).toISOString();
}

/** New = never completed; Review = completed and due now; Learned = completed and not due. */
export function studyStatus(progress: VariationProgress | undefined, now: Date): StudyStatus {
  if (!progress?.learned) {
    return "new";
  }
  const due = progress.reviewDueAt ? Date.parse(progress.reviewDueAt) : Number.NaN;
  if (Number.isFinite(due) && due <= now.getTime()) {
    return "review";
  }
  return "learned";
}

/** First completion of a line: level 1, due in 4 h. */
export function afterFirstLearn(progress: VariationProgress, now: Date): VariationProgress {
  return {
    ...progress,
    learned: true,
    reviewLevel: 1,
    reviewDueAt: dueAfterLevel(1, now),
    lastReviewedAt: now.toISOString(),
  };
}

/** A correct review climbs one rung (capped); a mistake drops back to the first. */
export function afterReview(
  progress: VariationProgress,
  result: { correct: boolean },
  now: Date,
): VariationProgress {
  const current = progress.reviewLevel ?? 0;
  const level = result.correct ? Math.min(current + 1, MAX_REVIEW_LEVEL) : 1;
  return {
    ...progress,
    reviewLevel: level,
    reviewDueAt: dueAfterLevel(level, now),
    lastReviewedAt: now.toISOString(),
  };
}

/**
 * Finishing Treinar. A new line, or one just learned in this session, enters
 * the ladder at level 1 and stays at level 0 (due in 4 h) when the run had a
 * mistake. A line already on the ladder is reviewed normally: clean climbs a
 * rung, a mistake drops back to the first.
 */
export function afterTrain(
  progress: VariationProgress | undefined,
  result: { mistakes: number; learnedThisSession?: boolean },
  now: Date,
): VariationProgress {
  const current = progress ?? { step: 0, learned: false };
  if (result.learnedThisSession || studyStatus(current, now) === "new") {
    const first = afterFirstLearn(current, now);
    return result.mistakes === 0 ? first : { ...first, reviewLevel: 0 };
  }
  return afterReview(current, { correct: result.mistakes === 0 }, now);
}
