"use client";

import Link from "next/link";
import { tCourse } from "@/src/i18n/course-strings";
import { formatInteger } from "@/src/i18n/format";
import type { SiteLocale } from "@/src/i18n/locale";
import type { NextStudyLine } from "../next-line";
import { reviewDueLabel } from "../review-queue";
import { reviewResultText, type ReviewLineResult } from "./review-session";

const PRIMARY_LINK =
  "inline-flex h-8 items-center justify-center rounded-lg bg-studio-accent px-3.5 text-body font-medium text-studio-accent-fg hover:bg-studio-accent-strong";
const SECONDARY_LINK =
  "inline-flex h-8 items-center justify-center rounded-lg bg-studio-hover-strong px-3.5 text-body font-medium text-studio-fg hover:bg-studio-selected";

/**
 * SIG-1386: where a review leads. With a line left to learn, Continuar
 * estudando opens it and Voltar ao curso stays as the secondary action; once
 * every line is learned, the course is complete and Voltar ao curso is the
 * only (primary) action.
 */
function ReviewNextActions({
  locale,
  courseSlug,
  nextLine,
}: {
  locale: SiteLocale;
  courseSlug: string;
  nextLine: NextStudyLine | null;
}) {
  const courseHref = `/courses/${courseSlug}`;
  return (
    <div data-review-next className="mt-5">
      <p className="text-body text-studio-muted">
        {nextLine
          ? tCourse(locale, "course.review.next.line", {
              chapter: nextLine.chapterTitle,
              line: nextLine.title,
            })
          : tCourse(locale, "course.review.next.courseDone")}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {nextLine ? (
          <>
            <Link href={`${courseHref}/${nextLine.id}`} className={PRIMARY_LINK}>
              {tCourse(locale, "course.review.next.continue")}
            </Link>
            <Link href={courseHref} className={SECONDARY_LINK}>
              {tCourse(locale, "course.lesson.backToCourse")}
            </Link>
          </>
        ) : (
          <Link href={courseHref} className={PRIMARY_LINK}>
            {tCourse(locale, "course.lesson.backToCourse")}
          </Link>
        )}
      </div>
    </div>
  );
}

/**
 * SIG-1375: "Revisão · X de N" plus one segment per line of the session.
 * Segments fill as lines are reviewed; the current one carries the ring.
 */
export function ReviewHeader({
  locale,
  courseSlug,
  courseTitle,
  lineTitle,
  chapterTitle,
  position,
  total,
  completed,
}: {
  locale: SiteLocale;
  courseSlug: string;
  courseTitle: string;
  /** Omitted on the summary, which has no line on the board. */
  lineTitle?: string;
  chapterTitle?: string;
  /** 1-based position shown in the heading. */
  position: number;
  total: number;
  /** Lines whose result is already in. */
  completed: number;
}) {
  return (
    <header className="shrink-0 border-b border-studio-border bg-studio-chrome px-4 py-3">
      <p className="truncate text-caption text-studio-muted">
        <Link href={`/courses/${courseSlug}`} className="hover:text-studio-fg">
          {courseTitle}
        </Link>
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <h1
          data-review-heading
          className="text-body font-semibold text-studio-fg"
        >
          {tCourse(locale, "course.review.heading", {
            current: formatInteger(locale, position),
            total: formatInteger(locale, total),
          })}
        </h1>
        <span className="rounded-full bg-studio-hover px-2 py-0.5 text-caption font-medium text-studio-accent-text">
          {tCourse(locale, "course.lesson.mode.train")}
        </span>
      </div>
      {lineTitle && chapterTitle ? (
        <p className="truncate text-caption text-studio-muted">
          {chapterTitle} · {lineTitle}
        </p>
      ) : null}
      <div
        role="progressbar"
        aria-label={tCourse(locale, "course.review.progressAria")}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={Math.min(completed, total)}
        className="mt-2"
      >
        <ol className="flex gap-1" aria-hidden>
          {Array.from({ length: total }, (_, index) => {
            const done = index < completed;
            const current = !done && index === position - 1;
            return (
              <li
                key={index}
                data-review-segment
                data-state={done ? "done" : current ? "current" : "pending"}
                className={`h-1.5 flex-1 rounded-full ${
                  done
                    ? "bg-studio-accent"
                    : current
                      ? "bg-studio-track ring-2 ring-studio-accent ring-offset-1 ring-offset-studio-chrome"
                      : "bg-studio-track"
                }`}
              />
            );
          })}
        </ol>
      </div>
    </header>
  );
}

/**
 * SIG-1375: the end of the session. One row per reviewed line with the result
 * ("Sem erros" / "N erros") and when the line is due again ("em 3 dias").
 */
export function ReviewSummary({
  locale,
  courseSlug,
  nextLine,
  results,
  now = new Date(),
}: {
  locale: SiteLocale;
  courseSlug: string;
  /** SIG-1386: the line to study next; null once every line is learned. */
  nextLine: NextStudyLine | null;
  results: readonly ReviewLineResult[];
  now?: Date;
}) {
  return (
    <main className="min-h-0 flex-1 overflow-y-auto px-4 py-6">
      <div className="mx-auto w-full max-w-3xl">
        <h2 className="text-title font-semibold text-studio-fg">
          {tCourse(locale, "course.review.summary.heading")}
        </h2>
        <ul
          aria-label={tCourse(locale, "course.review.summary.linesAria")}
          className="mt-4 space-y-2"
        >
          {results.map((result) => (
            <li
              key={result.variationId}
              data-review-summary-line
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg border border-studio-border bg-studio-chrome px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-body font-medium text-studio-fg">
                  {result.title}
                </p>
                <p className="truncate text-caption text-studio-muted">
                  {result.chapterTitle}
                </p>
              </div>
              <div className="text-right">
                <p
                  className={`text-body font-medium ${
                    result.mistakes === 0
                      ? "text-studio-success"
                      : "text-studio-warning-fg"
                  }`}
                >
                  {reviewResultText(locale, result.mistakes)}
                </p>
                <p className="text-caption text-studio-muted">
                  {tCourse(locale, "course.review.summary.nextDue", {
                    when: reviewDueLabel(locale, result.dueAt, now),
                  })}
                </p>
              </div>
            </li>
          ))}
        </ul>
        <ReviewNextActions
          locale={locale}
          courseSlug={courseSlug}
          nextLine={nextLine}
        />
      </div>
    </main>
  );
}

/**
 * SIG-1375: nothing is due. SIG-1386: the next line to study is offered
 * instead of only a link back to the course.
 */
export function ReviewEmptyState({
  locale,
  courseSlug,
  nextLine,
}: {
  locale: SiteLocale;
  courseSlug: string;
  nextLine: NextStudyLine | null;
}) {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <h1 className="text-title font-semibold text-studio-fg">
        {tCourse(locale, "course.review.title")}
      </h1>
      <p data-review-empty className="mt-2 text-body text-studio-muted">
        {tCourse(locale, "course.progress.header.noneDue")}
      </p>
      <ReviewNextActions
        locale={locale}
        courseSlug={courseSlug}
        nextLine={nextLine}
      />
    </main>
  );
}
