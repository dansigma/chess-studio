"use client";

import Link from "next/link";
import { Check, ChevronDown, Circle, CircleDot, ListTree, Video } from "lucide-react";
import { tCourse } from "@/src/i18n/course-strings";
import { formatInteger } from "@/src/i18n/format";
import type { SiteLocale } from "@/src/i18n/locale";
import { lineProgressLabel } from "../lesson.ts";
import type { Course, CourseChapter, CourseVariation, VariationProgress } from "../types";
import { ChapterStudioMenu } from "./ChapterStudioMenu";

/** Chapters shown in the syllabus: the ones that have at least one line. */
function visibleChapters(chapters: readonly CourseChapter[]): CourseChapter[] {
  return chapters.filter((chapter) => chapter.variations.length > 0);
}

/** SIG-1360: header numbers for the syllabus (chapters with lines only). */
export function syllabusSummary(chapters: readonly CourseChapter[]): {
  chapters: number;
  lines: number;
  videos: number;
} {
  const shown = visibleChapters(chapters);
  return {
    chapters: shown.length,
    lines: shown.reduce((sum, chapter) => sum + chapter.variations.length, 0),
    videos: shown.filter((chapter) => chapter.hasVideo || Boolean(chapter.videoUrl)).length,
  };
}

function linesLabel(locale: SiteLocale, count: number): string {
  return count === 1
    ? tCourse(locale, "course.catalog.lines.one")
    : tCourse(locale, "course.catalog.lines.other", { count: formatInteger(locale, count) });
}

/**
 * SIG-1360: expandable syllabus. Native details/summary; the first chapter is
 * open by default. The "aulas em vídeo" part is omitted when the count is 0.
 */
export function CourseSyllabus({
  course,
  locale,
  progress,
  frameCounts,
  onOpenInStudio,
}: {
  course: Course;
  locale: SiteLocale;
  progress: Record<string, VariationProgress>;
  frameCounts: Record<string, number | null>;
  onOpenInStudio: (variation: CourseVariation) => void;
}) {
  const chapters = visibleChapters(course.chapters);
  if (chapters.length === 0) {
    return null;
  }
  const summary = syllabusSummary(course.chapters);
  const parts = [
    summary.chapters === 1
      ? tCourse(locale, "course.catalog.chapters.one")
      : tCourse(locale, "course.catalog.chapters.other", { count: formatInteger(locale, summary.chapters) }),
    linesLabel(locale, summary.lines),
  ];
  if (summary.videos > 0) {
    parts.push(
      summary.videos === 1
        ? tCourse(locale, "course.syllabus.videos.one")
        : tCourse(locale, "course.syllabus.videos.other", { count: formatInteger(locale, summary.videos) }),
    );
  }

  return (
    <section className="mt-8" aria-labelledby="course-syllabus-heading">
      <div className="mb-3">
        <h2 id="course-syllabus-heading" className="text-body font-semibold text-studio-fg">
          {tCourse(locale, "course.syllabus.heading")}
        </h2>
        <p className="text-caption text-studio-muted">{parts.join(" · ")}</p>
      </div>
      <div className="space-y-3">
        {chapters.map((chapter, chapterIndex) => {
          const hasVideo = chapter.hasVideo || Boolean(chapter.videoUrl);
          return (
            <details
              key={chapter.id}
              open={chapterIndex === 0}
              className="group overflow-hidden rounded-xl border border-studio-border"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 bg-studio-chrome px-4 py-3 [&::-webkit-details-marker]:hidden">
                <span className="min-w-0">
                  <span className="block text-caption uppercase tracking-wide text-studio-muted">
                    {tCourse(locale, "course.course.chapterHeading", { n: formatInteger(locale, chapterIndex + 1) })}
                  </span>
                  <span className="block text-body font-semibold text-studio-fg">{chapter.title}</span>
                </span>
                <span className="flex shrink-0 items-center gap-3 text-caption text-studio-muted">
                  {hasVideo ? (
                    <Video
                      size={16}
                      data-testid="chapter-video-icon"
                      aria-label={tCourse(locale, "course.syllabus.hasVideo")}
                      role="img"
                    />
                  ) : null}
                  <span className="flex items-center gap-1">
                    <ListTree size={16} aria-hidden />
                    {linesLabel(locale, chapter.variations.length)}
                  </span>
                  <ChevronDown size={16} aria-hidden className="transition-transform group-open:rotate-180" />
                </span>
              </summary>
              <div className="flex items-start justify-between gap-3 border-t border-studio-border px-4 py-3">
                <p className="min-w-0 whitespace-pre-line text-caption text-studio-muted">
                  {chapter.description?.trim() ?? ""}
                </p>
                <ChapterStudioMenu variations={chapter.variations} locale={locale} onOpen={onOpenInStudio} />
              </div>
              <ul>
                {chapter.variations.map((variation) => {
                  const saved = progress[variation.id];
                  const label = lineProgressLabel(saved, frameCounts[variation.id] ?? null, locale);
                  const learned = Boolean(saved?.learned);
                  const started = !learned && (saved?.step ?? 0) > 0;
                  return (
                    <li key={variation.id} className="border-t border-studio-border">
                      <Link
                        href={`/courses/${course.slug}/${variation.id}`}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-studio-hover"
                      >
                        {learned ? (
                          <Check size={16} className="shrink-0 text-studio-success" aria-hidden />
                        ) : started ? (
                          <CircleDot size={16} className="shrink-0 text-studio-accent-text" aria-hidden />
                        ) : (
                          <Circle size={16} className="shrink-0 text-studio-faint" aria-hidden />
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-body text-studio-fg">{variation.title}</span>
                          <span className={`block text-caption ${learned ? "text-studio-success" : "text-studio-muted"}`}>
                            {label}
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </details>
          );
        })}
      </div>
    </section>
  );
}
