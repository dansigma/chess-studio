import type { VariationProgress } from "./types";

export type ProgressMergeResult = {
  merged: Record<string, VariationProgress>;
  toUpload: Record<string, VariationProgress>;
};

export function mergeProgress(
  local: Record<string, VariationProgress>,
  remote: Record<string, VariationProgress>,
): ProgressMergeResult {
  const merged: Record<string, VariationProgress> = {};
  const toUpload: Record<string, VariationProgress> = {};
  for (const id of new Set([...Object.keys(local), ...Object.keys(remote)])) {
    const localEntry = local[id];
    const remoteEntry = remote[id];
    const step = Math.max(localEntry?.step ?? 0, remoteEntry?.step ?? 0);
    const learned = Boolean(localEntry?.learned) || Boolean(remoteEntry?.learned);
    const entry: VariationProgress = { step, learned, ...mergeReview(localEntry, remoteEntry) };
    merged[id] = entry;
    if (
      !remoteEntry ||
      step > remoteEntry.step ||
      (learned && !remoteEntry.learned) ||
      reviewDiffers(entry, remoteEntry)
    ) {
      toUpload[id] = entry;
    }
  }
  return { merged, toUpload };
}

function time(value: string | null | undefined): number {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function hasReview(p: VariationProgress | undefined): boolean {
  return p !== undefined && ((p.reviewLevel ?? 0) > 0 || p.reviewDueAt != null || p.lastReviewedAt != null);
}

/**
 * Review fields: level = max, last_reviewed = latest, due comes from the side
 * with the latest last_reviewed (ties and missing dates keep the later due).
 * Returns nothing when neither side has review data.
 */
function mergeReview(
  a: VariationProgress | undefined,
  b: VariationProgress | undefined,
): Pick<VariationProgress, "reviewLevel" | "reviewDueAt" | "lastReviewedAt"> {
  if (!hasReview(a) && !hasReview(b)) {
    return {};
  }
  const reviewLevel = Math.max(a?.reviewLevel ?? 0, b?.reviewLevel ?? 0);
  const lastA = time(a?.lastReviewedAt);
  const lastB = time(b?.lastReviewedAt);
  let source: VariationProgress | undefined;
  if (lastA !== lastB) {
    source = lastA > lastB ? a : b;
  } else {
    source = time(a?.reviewDueAt) >= time(b?.reviewDueAt) ? a : b;
  }
  const lastReviewedAt = (lastA >= lastB ? a?.lastReviewedAt : b?.lastReviewedAt) ?? null;
  return { reviewLevel, reviewDueAt: source?.reviewDueAt ?? null, lastReviewedAt };
}

function reviewDiffers(entry: VariationProgress, remote: VariationProgress): boolean {
  return (
    (entry.reviewLevel ?? 0) !== (remote.reviewLevel ?? 0) ||
    (entry.reviewDueAt ?? null) !== (remote.reviewDueAt ?? null) ||
    (entry.lastReviewedAt ?? null) !== (remote.lastReviewedAt ?? null)
  );
}
