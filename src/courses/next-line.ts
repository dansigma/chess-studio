import type { VariationProgress } from "./types";

/**
 * The line a student should open next: the first line, in course order, that
 * is not learned yet. Null when there are no lines or every line is learned
 * (callers then link to the course page).
 */
export function nextLineId(
  variationIds: readonly string[],
  progress: Readonly<Record<string, VariationProgress | undefined>>,
): string | null {
  for (const id of variationIds) {
    if (!progress[id]?.learned) {
      return id;
    }
  }
  return null;
}
