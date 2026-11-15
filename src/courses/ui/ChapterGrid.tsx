"use client";

import { tCourse } from "@/src/i18n/course-strings";
import type { SiteLocale } from "@/src/i18n/locale";
import type { Course, CourseChapter, VariationProgress } from "../types";
import { ChapterCard } from "./ChapterCard";

/**
 * SIG-1362: the enrolled student's chapter grid. Replaces the syllabus once
 * the student has progress; the chapter cards carry their own status.
 */
export function ChapterGrid({
  course,
  chapters,
  progress,
  locale,
  now = new Date(),
}: {
  course: Course;
  /** Chapters in course order; chapters without lines are skipped. */
  chapters: readonly CourseChapter[];
  progress: Readonly<Record<string, VariationProgress | undefined>>;
  locale: SiteLocale;
  now?: Date;
}) {
  // A chapter without lines has nothing to study; numbering follows the
  // chapters that are shown, matching the syllabus order.
  const shown = chapters.filter((chapter) => chapter.variations.length > 0);
  return (
    <section className="mt-8" aria-labelledby="course-chapters-heading">
      <h2 id="course-chapters-heading" className="text-body font-semibold text-studio-fg">
        {tCourse(locale, "course.chapters.heading")}
      </h2>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((chapter, index) => (
          <ChapterCard
            key={chapter.id}
            course={course}
            chapter={chapter}
            index={index}
            progress={progress}
            locale={locale}
            now={now}
          />
        ))}
      </ul>
    </section>
  );
}
