import { nextLineId } from "./next-line.ts";
import { studyStatus } from "./review.ts";
import type { CatalogCourse, VariationProgress } from "./types.ts";

export const CONTINUE_RAIL_LIMIT = 4;

export type ContinueRailItem = {
  course: CatalogCourse;
  percent: number;
  /** First line not learned yet; null when every line is learned. */
  nextLineId: string | null;
  nextLineTitle: string | null;
  /** Lines of this course due for review now. */
  dueCount: number;
  /** Most recent progress update among the course's lines, or null. */
  lastStudiedAt: string | null;
};

function time(value: string | null | undefined): number {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

/**
 * Courses the student is studying (any line started or learned), most
 * recently studied first, capped at four. Courses without dates sort last,
 * keeping catalog order.
 */
export function continueRail(
  courses: readonly CatalogCourse[],
  progress: Readonly<Record<string, VariationProgress | undefined>>,
  now: Date,
): ContinueRailItem[] {
  const items: ContinueRailItem[] = [];
  for (const course of courses) {
    const entries = course.variationIds.map((id) => progress[id]);
    if (!entries.some((entry) => entry && (entry.learned || entry.step > 0))) {
      continue;
    }
    const learned = entries.filter((entry) => entry?.learned).length;
    const next = nextLineId(course.variationIds, progress);
    let lastStudiedAt: string | null = null;
    for (const entry of entries) {
      if (entry?.updatedAt && time(entry.updatedAt) > time(lastStudiedAt)) {
        lastStudiedAt = entry.updatedAt;
      }
    }
    items.push({
      course,
      percent: Math.round((learned / course.variationIds.length) * 100),
      nextLineId: next,
      nextLineTitle: next ? (course.variationTitles[next] ?? null) : null,
      dueCount: entries.filter((entry) => studyStatus(entry, now) === "review").length,
      lastStudiedAt,
    });
  }
  // Array.prototype.sort is stable.
  items.sort((a, b) => time(b.lastStudiedAt) - time(a.lastStudiedAt));
  return items.slice(0, CONTINUE_RAIL_LIMIT);
}
