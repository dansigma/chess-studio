"use client";

import { useState } from "react";
import Link from "next/link";
import { catalogCoursePercent, courseThemeLabel, isCourseTheme } from "./catalog";
import { tCourse } from "@/src/i18n/course-strings";
import { formatInteger } from "@/src/i18n/format";
import { SiteFooter } from "@/src/site/SiteFooter";
import { CourseChrome } from "./CourseChrome";
import { courseSummaryText } from "./description";
import { courseImageUrl } from "./media";
import { useStudioStore } from "@/src/store/studio-store";
import { COURSE_THEMES, type CatalogCourse, type CourseTheme } from "./types";
import { useCourseData } from "./use-courses";

export function CatalogView({ courses }: { courses: CatalogCourse[] }) {
  const locale = useStudioStore((state) => state.settings.locale);
  const { progress, admin, isAdmin, ready, signedIn, source } = useCourseData();
  const [theme, setTheme] = useState<CourseTheme | "">("");
  const visible = theme ? courses.filter((course) => course.theme === theme) : courses;

  return (
    <div className="min-h-full bg-studio-bg">
      <CourseChrome admin={admin} isAdmin={isAdmin} />
      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-studio-fg">{tCourse(locale, "course.catalog.heading")}</h1>
            <p className="mt-2 max-w-2xl text-body text-studio-muted">
              {tCourse(locale, "course.catalog.intro")}
            </p>
          </div>
          <label className="text-caption text-studio-muted">
            {tCourse(locale, "course.catalog.filterTheme")}
            <select
              value={theme}
              onChange={(event) => {
                const next = event.target.value;
                setTheme(next === "" || isCourseTheme(next) ? next : "");
              }}
              className="mt-1 block rounded-lg border border-studio-border bg-studio-chrome px-3 py-2 text-body text-studio-fg"
            >
              <option value="">{tCourse(locale, "course.catalog.filterAll")}</option>
              {COURSE_THEMES.map((item) => (
                <option key={item.id} value={item.id}>
                  {courseThemeLabel(item.id, locale)}
                </option>
              ))}
            </select>
          </label>
        </div>
        {ready && !signedIn ? (
          <p className="mt-3 text-caption text-studio-muted">
            <Link href="/login" className="text-studio-accent-text">
              {tCourse(locale, "course.common.signIn")}
            </Link>{" "}
            {tCourse(locale, "course.catalog.signinSuffix")}
          </p>
        ) : null}
        {signedIn && source === "browser" ? (
          <p className="mt-3 text-caption text-studio-warning-fg">{tCourse(locale, "course.catalog.browserOnly")}</p>
        ) : null}
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {courses.length === 0 ? (
            <p className="text-body text-studio-muted">{tCourse(locale, "course.catalog.empty")}</p>
          ) : visible.length === 0 ? (
            <p className="text-body text-studio-muted">{tCourse(locale, "course.catalog.emptyTheme")}</p>
          ) : null}
          {visible.map((course) => {
            const percent = catalogCoursePercent(course, progress);
            const cover = courseImageUrl(course.coverUrl);
            return (
              <Link
                key={course.id}
                href={`/courses/${course.slug}`}
                className="overflow-hidden rounded-xl border border-studio-border bg-studio-chrome hover:border-studio-border-strong"
              >
                <div className="aspect-video bg-studio-hover">
                  {cover ? (
                    // eslint-disable-next-line @next/next/no-img-element -- cover is an arbitrary user-supplied https URL; next/image would need a per-host remotePatterns allowlist
                    <img src={cover} alt="" className="h-full w-full object-cover" />
                  ) : null}
                </div>
                <div className="p-5">
                  <div className="text-caption uppercase tracking-wide text-studio-accent-text">
                    {tCourse(locale, "course.catalog.cardThemeColor", {
                      theme: courseThemeLabel(course.theme, locale),
                      color: tCourse(
                        locale,
                        course.color === "black" ? "course.catalog.color.black" : "course.catalog.color.white",
                      ),
                    })}
                  </div>
                  <h2 className="mt-2 text-lg font-semibold text-studio-fg">{course.title}</h2>
                  <p className="mt-2 line-clamp-3 text-body text-studio-muted">{courseSummaryText(course.summary)}</p>
                  <div className="mt-4 text-caption text-studio-faint">
                    {tCourse(locale, "course.catalog.counts", {
                      chapters:
                        course.chapterCount === 1
                          ? tCourse(locale, "course.catalog.chapters.one")
                          : tCourse(locale, "course.catalog.chapters.other", {
                              count: formatInteger(locale, course.chapterCount),
                            }),
                      lines:
                        course.moveCount === 1
                          ? tCourse(locale, "course.catalog.lines.one")
                          : tCourse(locale, "course.catalog.lines.other", {
                              count: formatInteger(locale, course.moveCount),
                            }),
                    })}
                  </div>
                  <div
                    className="mt-3 h-1.5 overflow-hidden rounded-full bg-studio-hover"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={percent}
                    aria-label={tCourse(locale, "course.catalog.progressAria", { title: course.title })}
                  >
                    <div className="h-full rounded-full bg-studio-accent" style={{ width: `${percent}%` }} />
                  </div>
                  <div className="mt-1 text-caption text-studio-muted">
                    {tCourse(locale, "course.catalog.percentComplete", {
                      percent: formatInteger(locale, percent),
                    })}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
