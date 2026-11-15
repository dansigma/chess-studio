"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { tCourse } from "@/src/i18n/course-strings";
import { formatInteger } from "@/src/i18n/format";
import type { SiteLocale } from "@/src/i18n/locale";
import { lineProgressLabel } from "../lesson.ts";
import type { VariationProgress } from "../types";
import type { ChapterSegment } from "./model";

/**
 * Course and chapter (linking back), line title, "Variant X of Y" and one
 * clickable segment per line of the chapter. ProgressBar's segments are not
 * interactive, so these are links with the same look.
 */
export function LessonHeader({
  locale,
  courseSlug,
  courseTitle,
  chapterTitle,
  lineTitle,
  segments,
  progress,
  actions,
}: {
  locale: SiteLocale;
  courseSlug: string;
  courseTitle: string;
  chapterTitle: string;
  lineTitle: string;
  segments: ChapterSegment[];
  progress: Record<string, VariationProgress | undefined>;
  actions?: ReactNode;
}) {
  const total = segments.length;
  const current = segments.find((segment) => segment.current);
  const back = `/courses/${courseSlug}`;
  return (
    <header className="shrink-0 border-b border-studio-border bg-studio-chrome px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-caption text-studio-muted">
            <Link href={back} className="hover:text-studio-fg">
              {courseTitle}
            </Link>
            <span aria-hidden> · </span>
            <Link href={back} className="hover:text-studio-fg">
              {chapterTitle}
            </Link>
          </p>
          <h1 className="text-body font-semibold text-studio-fg">
            {lineTitle}
          </h1>
          {current ? (
            <p className="text-caption tabular-nums text-studio-muted">
              {tCourse(locale, "course.lesson.variantOf", {
                current: formatInteger(locale, current.index),
                total: formatInteger(locale, total),
              })}
            </p>
          ) : null}
        </div>
        {actions}
      </div>
      <nav
        aria-label={tCourse(locale, "course.lesson.segmentsAria")}
        className="mt-2"
      >
        <ol className="flex gap-1">
          {segments.map((segment) => {
            const status = lineProgressLabel(
              progress[segment.id],
              null,
              locale,
            );
            const label = tCourse(locale, "course.lesson.segmentLabel", {
              current: formatInteger(locale, segment.index),
              total: formatInteger(locale, total),
              status,
            });
            return (
              <li key={segment.id} className="min-w-0 flex-1">
                <Link
                  href={`${back}/${segment.id}`}
                  aria-label={label}
                  title={label}
                  aria-current={segment.current ? "step" : undefined}
                  data-segment
                  data-learned={segment.learned || undefined}
                  data-current={segment.current || undefined}
                  className="group flex h-4 items-center"
                >
                  <span
                    className={`block h-1.5 w-full rounded-full group-hover:opacity-80 ${
                      segment.learned ? "bg-studio-accent" : "bg-studio-track"
                    } ${segment.current ? "ring-2 ring-studio-accent ring-offset-1 ring-offset-studio-chrome" : ""}`}
                  />
                </Link>
              </li>
            );
          })}
        </ol>
      </nav>
    </header>
  );
}
