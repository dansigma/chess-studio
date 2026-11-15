"use client";

import type { ReactNode } from "react";
import { tCourse } from "@/src/i18n/course-strings";
import type { SiteLocale } from "@/src/i18n/locale";
import { courseThemeLabel } from "../catalog";
import { courseImageUrl } from "../media";
import { CourseSummary } from "../CourseSummary";
import type { Course } from "../types";
import { VideoEmbed } from "./VideoEmbed";

/**
 * SIG-1358: course presentation. Main column (title, author, intro video,
 * description) plus the `aside` info card. On phones the card sits right
 * below the video, before the description; on wide screens it is a sticky
 * second column spanning both rows.
 */
export function CourseOverview({ course, locale, aside }: { course: Course; locale: SiteLocale; aside: ReactNode }) {
  const cover = courseImageUrl(course.coverUrl);
  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:grid-rows-[auto_1fr] lg:gap-x-8">
      <div className="min-w-0 lg:col-start-1 lg:row-start-1">
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
      </div>
      <div className="mt-6 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:mt-0">{aside}</div>
      <CourseSummary
        html={course.summary}
        className="mt-5 min-w-0 lg:col-start-1 lg:row-start-2 space-y-3 text-body leading-relaxed text-studio-muted [&_em]:italic [&_li+li]:mt-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_strong]:font-semibold [&_strong]:text-studio-fg [&_u]:underline [&_ul]:list-disc [&_ul]:pl-5"
      />
    </div>
  );
}
