// SIG-1375: the queue behind a review session. A line is due when its saved
// review_due_at has passed; the session walks every due line of the course
// (or of one chapter), most overdue first.
import { tCourse } from "@/src/i18n/course-strings";
import { formatInteger } from "@/src/i18n/format";
import type { SiteLocale } from "@/src/i18n/locale";
import { CHAPTER_PARAM, chapterParam } from "./chapter-param";
import { studyStatus } from "./review";
import type { Course, CourseVariation, VariationProgress } from "./types";

/**
 * Static segment of the review session route. It wins over `[variationId]`,
 * so a line id must never be exactly this string (checked by the seed test).
 */
export const REVIEW_SEGMENT = "revisar";

/**
 * Address of the review session, optionally limited to one chapter.
 * `chapterIndex` is the zero-based position among the chapters shown; the
 * URL keeps the 1-based `?capitulo=N` used by the chapter grid.
 */
export function reviewHref(courseSlug: string, chapterIndex?: number): string {
  const base = `/courses/${courseSlug}/${REVIEW_SEGMENT}`;
  return chapterIndex === undefined
    ? base
    : `${base}?${CHAPTER_PARAM}=${chapterParam(chapterIndex)}`;
}

export type DueLine = {
  chapterId: string;
  chapterTitle: string;
  variation: CourseVariation;
  /** ISO time the line became due. */
  dueAt: string;
};

function dueTime(value: string | null | undefined): number {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

/**
 * Every line that is due for review now, most overdue first. Equal due times
 * keep course order. With `chapterId`, only that chapter is considered.
 */
export function dueQueue(
  course: Pick<Course, "chapters">,
  progress: Readonly<Record<string, VariationProgress | undefined>>,
  now: Date,
  chapterId?: string,
): DueLine[] {
  const queue: DueLine[] = [];
  for (const chapter of course.chapters) {
    if (chapterId !== undefined && chapter.id !== chapterId) {
      continue;
    }
    for (const variation of chapter.variations) {
      const saved = progress[variation.id];
      if (studyStatus(saved, now) !== "review" || !saved?.reviewDueAt) {
        continue;
      }
      queue.push({
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        variation,
        dueAt: saved.reviewDueAt,
      });
    }
  }
  // Array.prototype.sort is stable, so equal due times keep course order.
  return queue.sort((a, b) => dueTime(a.dueAt) - dueTime(b.dueAt));
}

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/**
 * When a reviewed line is next due, relative to `now`: "em 3 dias",
 * "em 4 horas" or "agora". Missing or invalid dates read "agora".
 */
export function reviewDueLabel(
  locale: SiteLocale,
  dueAt: string | null | undefined,
  now: Date,
): string {
  const due = dueAt ? Date.parse(dueAt) : Number.NaN;
  const diff = due - now.getTime();
  if (!Number.isFinite(diff) || diff < HOUR_MS) {
    return tCourse(locale, "course.review.due.now");
  }
  if (diff < DAY_MS) {
    const hours = Math.max(1, Math.round(diff / HOUR_MS));
    return tCourse(
      locale,
      hours === 1 ? "course.review.due.hours.one" : "course.review.due.hours.other",
      { count: formatInteger(locale, hours) },
    );
  }
  const days = Math.max(1, Math.round(diff / DAY_MS));
  return tCourse(
    locale,
    days === 1 ? "course.review.due.days.one" : "course.review.due.days.other",
    { count: formatInteger(locale, days) },
  );
}
