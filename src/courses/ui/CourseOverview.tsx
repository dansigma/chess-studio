"use client";

import { tCourse } from "@/src/i18n/course-strings";
import type { SiteLocale } from "@/src/i18n/locale";
import { courseThemeLabel } from "../catalog";
import { courseImageUrl } from "../media";
import { CourseSummary } from "../CourseSummary";
import type { Course } from "../types";
import { VideoEmbed } from "./VideoEmbed";

/** SIG-1358: main column of the course page: title, author, intro video, description. */
export function CourseOverview({ course, locale }: { course: Course; locale: SiteLocale }) {
  const cover = courseImageUrl(course.coverUrl);
  return (
    <div className="min-w-0">
      <div className="flex items-start gap-4">
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-studio-border bg-studio-hover">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element -- cover is an arbitrary user-supplied https URL; next/image would need a per-host remotePatterns allowlist
            <img src={cover} alt="" className="h-full w-full object-cover" />
          ) : null}
        </div>
        <div className="min-w-0">
          <p className="text-caption uppercase tracking-wide text-studio-faint">
            {courseThemeLabel(course.theme, locale)} ·{" "}
            {tCourse(locale, course.color === "black" ? "course.course.pieces.black" : "course.course.pieces.white")}
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-studio-fg">{course.title}</h1>
          {course.authorName ? <p className="mt-1 text-body text-studio-muted">{course.authorName}</p> : null}
        </div>
      </div>
      <VideoEmbed url={course.videoUrl} title={course.title} />
      <CourseSummary
        html={course.summary}
        className="mt-5 space-y-3 text-body leading-relaxed text-studio-muted [&_em]:italic [&_li+li]:mt-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_strong]:font-semibold [&_strong]:text-studio-fg [&_u]:underline [&_ul]:list-disc [&_ul]:pl-5"
      />
    </div>
  );
}
