"use client";

import Link from "next/link";
import { useStudioStore } from "@/src/store/studio-store";
import { tCourseAccess } from "@/src/i18n/course-access-strings";
import { tCourse } from "@/src/i18n/course-strings";
import type { Course } from "./types";

// SIG-1119: shown when the database refused course_content for this course
// (locked means the query succeeded with no row). The site is free, so this
// is a neutral message plus a link back to the course, never a paywall.
export function LockedLesson({ course }: { course: Course }) {
  const locale = useStudioStore((state) => state.settings.locale);
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <p className="text-body text-studio-muted">{tCourseAccess(locale, "course.access.unavailable")}</p>
      <Link
        href={`/courses/${course.slug}`}
        className="mt-4 inline-flex items-center rounded-lg bg-studio-accent px-4 py-2 text-body font-semibold text-studio-on-accent"
      >
        {tCourse(locale, "course.lesson.backToCourse")}
      </Link>
      <div className="mt-8 space-y-6">
        {course.chapters
          .filter((chapter) => chapter.variations.length > 0)
          .map((chapter, chapterIndex) => (
            <section key={chapter.id} className="overflow-hidden rounded-xl border border-studio-border">
              <header className="bg-studio-chrome px-4 py-3">
                <div className="text-caption uppercase tracking-wide text-studio-muted">
                  {`Chapter ${chapterIndex + 1}`}
                </div>
                <h2 className="text-body font-semibold text-studio-fg">{chapter.title}</h2>
              </header>
              <ul>
                {chapter.variations.map((variation) => (
                  <li key={variation.id} className="border-t border-studio-border px-4 py-2 text-body text-studio-muted">
                    {variation.title}
                  </li>
                ))}
              </ul>
            </section>
          ))}
      </div>
    </div>
  );
}
