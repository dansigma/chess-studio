"use client";

import { CourseChrome } from "@/src/courses/CourseChrome";
import { tCourse } from "@/src/i18n/course-strings";
import { useStudioStore } from "@/src/store/studio-store";

export default function CoursesError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const locale = useStudioStore((state) => state.settings.locale);
  return (
    <div className="min-h-full bg-studio-bg">
      <CourseChrome />
      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-2xl font-semibold text-studio-fg">{tCourse(locale, "course.error.title")}</h1>
        <p className="mt-2 text-body text-studio-muted">{tCourse(locale, "course.error.body")}</p>
        <button
          type="button"
          onClick={() => reset()}
          className="mt-4 rounded-lg border border-studio-border bg-studio-chrome px-4 py-2 text-body text-studio-fg hover:border-studio-border-strong"
        >
          {tCourse(locale, "course.error.retry")}
        </button>
      </main>
    </div>
  );
}
