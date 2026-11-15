"use client";

import Link from "next/link";
import { CourseChrome } from "@/src/courses/CourseChrome";
import { tCourse } from "@/src/i18n/course-strings";
import { useStudioStore } from "@/src/store/studio-store";

export default function CoursesNotFound() {
  const locale = useStudioStore((state) => state.settings.locale);
  return (
    <div className="min-h-full bg-studio-bg">
      <CourseChrome />
      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-2xl font-semibold text-studio-fg">{tCourse(locale, "course.notFound.title")}</h1>
        <p className="mt-2 text-body text-studio-muted">{tCourse(locale, "course.notFound.body")}</p>
        <Link href="/courses" className="mt-3 inline-block text-body text-studio-accent-text">
          {tCourse(locale, "course.notFound.back")}
        </Link>
      </main>
    </div>
  );
}
