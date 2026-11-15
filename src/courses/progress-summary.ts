import { courseVariationIds } from "./store";
import { nextLineId } from "./next-line";
import { studyStatus } from "./review";
import type { Course, VariationProgress } from "./types";

export type CourseProgressSummary = {
  learned: number;
  total: number;
  percent: number;
  /** Lines learned and due for spaced review now. */
  due: number;
  /** First line not learned yet, in course order. */
  nextLineId: string | null;
  firstLineId: string | null;
  firstDueLineId: string | null;
  /** Every line learned (derived from progress, not course_enrollments.completed_at). */
  complete: boolean;
  /** Any line started or learned. */
  hasProgress: boolean;
};

/** SIG-1361: the numbers behind the enrolled-student progress header. */
export function courseProgressSummary(
  course: Course,
  progress: Readonly<Record<string, VariationProgress | undefined>>,
  now: Date,
): CourseProgressSummary {
  const ids = courseVariationIds(course);
  const learned = ids.filter((id) => progress[id]?.learned).length;
  const dueIds = ids.filter((id) => studyStatus(progress[id], now) === "review");
  return {
    learned,
    total: ids.length,
    percent: ids.length === 0 ? 0 : Math.round((learned / ids.length) * 100),
    due: dueIds.length,
    nextLineId: nextLineId(ids, progress),
    firstLineId: ids[0] ?? null,
    firstDueLineId: dueIds[0] ?? null,
    complete: ids.length > 0 && learned === ids.length,
    hasProgress: ids.some((id) => progress[id]?.learned || (progress[id]?.step ?? 0) > 0),
  };
}
