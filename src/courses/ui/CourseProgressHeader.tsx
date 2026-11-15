"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { tCourse } from "@/src/i18n/course-strings";
import { formatInteger } from "@/src/i18n/format";
import type { SiteLocale } from "@/src/i18n/locale";
import { ProgressBar } from "@/src/site/ui/ProgressBar";
import { courseProgressSummary } from "../progress-summary";
import type { Course, VariationProgress } from "../types";

const BUTTON = "inline-flex h-8 items-center justify-center rounded-lg px-3.5 text-body font-medium";

/**
 * SIG-1361: shown above the presentation once the student has progress. `ready`
 * is false until progress has loaded, so nothing flashes. Until the review
 * session exists (27/27) Revisar links to the first due line and Revisar curso
 * to the first line of the course.
 */
export function CourseProgressHeader({
  course,
  progress,
  ready,
  locale,
  now = new Date(),
}: {
  course: Course;
  progress: Readonly<Record<string, VariationProgress | undefined>>;
  ready: boolean;
  locale: SiteLocale;
  now?: Date;
}) {
  if (!ready) {
    return null;
  }
  const summary = courseProgressSummary(course, progress, now);
  if (!summary.hasProgress) {
    return null;
  }
  const lineHref = (id: string | null) => (id ? `/courses/${course.slug}/${id}` : `/courses/${course.slug}`);
  const continueHref = summary.complete ? lineHref(summary.firstLineId) : lineHref(summary.nextLineId);
  return (
    <section
      aria-label={tCourse(locale, "course.course.progressHeading")}
      className="mb-6 rounded-xl border border-studio-border bg-studio-chrome p-4"
    >
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-body">
        <span className="text-studio-fg">
          {tCourse(locale, "course.progress.header.learned", {
            learned: formatInteger(locale, summary.learned),
            total: formatInteger(locale, summary.total),
          })}
        </span>
        <span className="font-medium text-studio-fg">
          {tCourse(locale, "course.progress.header.percent", { percent: formatInteger(locale, summary.percent) })}
        </span>
      </div>
      <ProgressBar value={summary.percent} label={tCourse(locale, "course.course.progressAria")} />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Link
          href={continueHref}
          className={`${BUTTON} bg-studio-accent text-studio-accent-fg hover:bg-studio-accent-strong`}
        >
          {tCourse(locale, summary.complete ? "course.progress.header.reviewCourse" : "course.progress.header.continue")}
        </Link>
        {summary.due > 0 ? (
          <Link
            href={lineHref(summary.firstDueLineId)}
            className={`${BUTTON} bg-studio-hover-strong text-studio-fg hover:bg-studio-selected`}
          >
            {tCourse(locale, "course.progress.header.review", { count: formatInteger(locale, summary.due) })}
          </Link>
        ) : (
          <span className="text-caption text-studio-muted">{tCourse(locale, "course.progress.header.noneDue")}</span>
        )}
        {summary.complete ? (
          <span className="inline-flex items-center gap-1 text-caption font-medium text-studio-success">
            <Check size={14} aria-hidden />
            {tCourse(locale, "course.progress.header.complete")}
          </span>
        ) : null}
      </div>
    </section>
  );
}
