import type { VariationProgress } from "./types";

/**
 * The line a student should open next: the first line, in course order, that
 * is not learned yet. Null when there are no lines or every line is learned
 * (the course page's info card then falls back to the first line).
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
