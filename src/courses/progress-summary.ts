import { courseVariationIds } from "./store";
import { nextLineId } from "./next-line";
import { studyStatus } from "./review";
import type { Course, CourseChapter, VariationProgress } from "./types";

/** Any line opened past its first move or learned. */
export function hasCourseProgress(
  course: Course,
  progress: Readonly<Record<string, VariationProgress | undefined>>,
): boolean {
  return course.chapters.some((chapter) =>
    chapter.variations.some((variation) => {
      const saved = progress[variation.id];
      return Boolean(saved?.learned) || (saved?.step ?? 0) > 0;
    }),
  );
}

const HOUR_MS = 3_600_000;
const FOUR_HOURS_MS = 4 * HOUR_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;

export type ReviewForecast = {
  /** Learned lines not yet due, due within (now, now + 4h]. */
  in4h: number;
  /** Learned lines due within (now + 4h, now + 24h]. */
  in1d: number;
  /** Learned lines due within (now + 24h, now + 7d]. */
  in7d: number;
};

/**
 * SIG-1388: upcoming review workload in disjoint, non-overlapping windows
 * over learned lines that are not already due at `now`.
 */
export function reviewForecast(
  course: Pick<Course, "chapters">,
  progress: Readonly<Record<string, VariationProgress | undefined>>,
  now: Date,
): ReviewForecast {
  const nowMs = now.getTime();
  let in4h = 0;
  let in1d = 0;
  let in7d = 0;
  for (const id of courseVariationIds(course)) {
    const saved = progress[id];
    if (!saved?.learned || !saved.reviewDueAt) {
      continue;
    }
    const dueMs = Date.parse(saved.reviewDueAt);
    if (!Number.isFinite(dueMs)) {
      continue;
    }
    const diff = dueMs - nowMs;
    if (diff <= 0 || diff > WEEK_MS) {
      continue;
    }
    if (diff <= FOUR_HOURS_MS) {
      in4h += 1;
    } else if (diff <= DAY_MS) {
      in1d += 1;
    } else {
      in7d += 1;
    }
  }
  return { in4h, in1d, in7d };
}

export type CourseProgressSummary = {
  learned: number;
  total: number;
  percent: number;
  /** Lines learned and due for spaced review now. */
  due: number;
  /** Upcoming review workload in disjoint windows after `now`. */
  in4h: number;
  in1d: number;
  in7d: number;
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
  const forecast = reviewForecast(course, progress, now);
  return {
    learned,
    total: ids.length,
    percent: ids.length === 0 ? 0 : Math.round((learned / ids.length) * 100),
    due: dueIds.length,
    ...forecast,
    nextLineId: nextLineId(ids, progress),
    firstLineId: ids[0] ?? null,
    firstDueLineId: dueIds[0] ?? null,
    complete: ids.length > 0 && learned === ids.length,
    hasProgress: hasCourseProgress(course, progress),
  };
}

export type ChapterStatus = "new" | "inProgress" | "done" | "review";

export type ChapterSummary = {
  /** Lines learned in the chapter. */
  learned: number;
  /** Lines in the chapter. */
  total: number;
  /** Learned lines due for spaced review now. */
  due: number;
  status: ChapterStatus;
};

/**
 * SIG-1362: the numbers behind one chapter card. Due lines win over done: a
 * chapter with reviews waiting reads Revisar (N) even when every line is
 * learned, because that is the action the student has to take.
 */
export function chapterSummary(
  chapter: CourseChapter,
  progress: Readonly<Record<string, VariationProgress | undefined>>,
  now: Date,
): ChapterSummary {
  let learned = 0;
  let due = 0;
  let started = false;
  for (const variation of chapter.variations) {
    const saved = progress[variation.id];
    if (saved?.learned) {
      learned += 1;
    } else if ((saved?.step ?? 0) > 0) {
      started = true;
    }
    if (studyStatus(saved, now) === "review") {
      due += 1;
    }
  }
  const total = chapter.variations.length;
  const status: ChapterStatus =
    due > 0
      ? "review"
      : total > 0 && learned === total
        ? "done"
        : learned > 0 || started
          ? "inProgress"
          : "new";
  return { learned, total, due, status };
}
