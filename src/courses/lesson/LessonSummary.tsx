"use client";

import { tCourse } from "@/src/i18n/course-strings";
import { formatInteger } from "@/src/i18n/format";
import type { SiteLocale } from "@/src/i18n/locale";

/**
 * SIG-1373: the end of Aprender — moves played, mistakes, and the author's
 * strategic plan (the last comment of the line). SIG-1374 adds the hints
 * taken in Treinar.
 */
export function LessonSummaryPanel({
  locale,
  moves,
  mistakes,
  hints,
  comment,
}: {
  locale: SiteLocale;
  moves: number;
  mistakes: number;
  /** Omitted in Aprender, which has no hint ladder. */
  hints?: number;
  comment: string;
}) {
  return (
    <div data-lesson-summary className="space-y-2">
      <h2 className="text-body font-semibold text-studio-success">
        {tCourse(locale, "course.lesson.summary.heading")}
      </h2>
      <p className="tabular-nums text-studio-fg">
        {tCourse(locale, "course.lesson.summary.moves", {
          count: formatInteger(locale, moves),
        })}
      </p>
      <p className="tabular-nums text-studio-fg">
        {tCourse(locale, "course.lesson.summary.mistakes", {
          count: formatInteger(locale, mistakes),
        })}
      </p>
      {hints !== undefined ? (
        <p className="tabular-nums text-studio-fg">
          {tCourse(locale, "course.lesson.summary.hints", {
            count: formatInteger(locale, hints),
          })}
        </p>
      ) : null}
      <div className="rounded-lg border border-studio-border px-3 py-2">
        <h2 className="text-caption font-semibold uppercase tracking-wide text-studio-muted">
          {tCourse(locale, "course.lesson.summary.plan")}
        </h2>
        {comment ? (
          <p className="mt-1 text-body leading-relaxed text-studio-comment">
            {comment}
          </p>
        ) : null}
      </div>
    </div>
  );
}
