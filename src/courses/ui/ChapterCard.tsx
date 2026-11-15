"use client";

import Link from "next/link";
import { ListTree, Video } from "lucide-react";
import { tCourse } from "@/src/i18n/course-strings";
import { formatInteger } from "@/src/i18n/format";
import type { SiteLocale } from "@/src/i18n/locale";
import { ProgressBar } from "@/src/site/ui/ProgressBar";
import { CHAPTER_PARAM, chapterParam } from "../chapter-param";
import { chapterSummary, type ChapterStatus } from "../progress-summary";
import { reviewHref } from "../review-queue";
import type { Course, CourseChapter, VariationProgress } from "../types";

const STATUS_KEY = {
  new: "course.chapter.status.new",
  inProgress: "course.chapter.status.inProgress",
  done: "course.chapter.status.done",
  review: "course.chapter.status.review",
} as const;

// Done reads green and reviews read amber; in progress and new stay neutral.
const STATUS_CLASS: Record<ChapterStatus, string> = {
  new: "border-studio-border bg-studio-hover-subtle text-studio-muted",
  inProgress: "border-studio-accent-soft bg-studio-accent-soft text-studio-accent-text",
  done: "border-studio-border bg-studio-hover-subtle text-studio-success",
  review: "border-studio-border bg-studio-hover-subtle text-studio-warning-fg",
};

const STATUS_PILL = "inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-caption font-medium";

function linesLabel(locale: SiteLocale, count: number): string {
  return count === 1
    ? tCourse(locale, "course.catalog.lines.one")
    : tCourse(locale, "course.catalog.lines.other", { count: formatInteger(locale, count) });
}

/**
 * SIG-1362: one chapter in the study grid: position and title, line count, a
 * mini learned/total bar, the video icon and the chapter status. The card
 * opens the chapter view through `?capitulo=N`; a chapter with reviews due
 * replaces its status pill with a link to that chapter's review session
 * (SIG-1375).
 */
export function ChapterCard({
  course,
  chapter,
  index,
  progress,
  locale,
  now,
}: {
  course: Course;
  chapter: CourseChapter;
  /** Zero-based position among the chapters shown. */
  index: number;
  progress: Readonly<Record<string, VariationProgress | undefined>>;
  locale: SiteLocale;
  now: Date;
}) {
  const summary = chapterSummary(chapter, progress, now);
  const number = index + 1;
  const hasVideo = chapter.hasVideo === true || Boolean(chapter.videoUrl);
  const dueCount = formatInteger(locale, summary.due);
  return (
    <li className="min-w-0">
      <div className="flex h-full flex-col rounded-xl border border-studio-border bg-studio-chrome p-4 hover:border-studio-border-strong">
        <Link
          href={`/courses/${course.slug}?${CHAPTER_PARAM}=${chapterParam(index)}`}
          data-chapter-open
          className="flex flex-1 flex-col"
        >
          <div className="text-caption uppercase tracking-wide text-studio-muted">
            {tCourse(locale, "course.course.chapterHeading", { n: formatInteger(locale, number) })}
          </div>
          <div className="mt-1 text-body font-semibold text-studio-fg">{chapter.title}</div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-studio-muted">
            <span className="inline-flex items-center gap-1">
              <ListTree size={14} aria-hidden />
              {linesLabel(locale, summary.total)}
            </span>
            {hasVideo ? (
              <Video
                size={14}
                data-testid="chapter-video-icon"
                aria-label={tCourse(locale, "course.syllabus.hasVideo")}
                role="img"
              />
            ) : null}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <ProgressBar
              className="h-1.5 flex-1 bg-studio-track"
              value={summary.learned}
              max={summary.total}
              label={tCourse(locale, "course.catalog.progressAria", { title: chapter.title })}
            />
            <span className="shrink-0 text-caption tabular-nums text-studio-muted">
              {tCourse(locale, "course.chapter.progress", {
                learned: formatInteger(locale, summary.learned),
                total: formatInteger(locale, summary.total),
              })}
            </span>
          </div>
        </Link>
        <div className="mt-3">
          {summary.due > 0 ? (
            <Link
              href={reviewHref(course.slug, index)}
              data-chapter-review
              className={`${STATUS_PILL} ${STATUS_CLASS.review} hover:bg-studio-hover-strong`}
            >
              {tCourse(locale, "course.chapter.status.review", { count: dueCount })}
            </Link>
          ) : (
            <span className={`${STATUS_PILL} ${STATUS_CLASS[summary.status]}`}>
              {tCourse(locale, STATUS_KEY[summary.status], { count: dueCount })}
            </span>
          )}
        </div>
      </div>
    </li>
  );
}
