import Link from "next/link";
import { useMemo } from "react";
import { continueRail } from "../continue-rail";
import { courseImageUrl } from "../media";
import type { CatalogCourse, VariationProgress } from "../types";
import { tCourse } from "@/src/i18n/course-strings";
import { formatInteger } from "@/src/i18n/format";
import type { SiteLocale } from "@/src/i18n/locale";
import { ProgressBar } from "@/src/site/ui/ProgressBar";
import { Badge } from "@/src/studio/ui/Controls";

/**
 * "Continue studying" row at the top of the catalog: up to four courses the
 * student is studying, each with a one-click resume and a due-review chip.
 * Renders nothing for visitors, before progress is ready, or with no progress.
 */
export function ContinueRail({
  courses,
  progress,
  locale,
  ready,
  signedIn,
}: {
  courses: readonly CatalogCourse[];
  progress: Readonly<Record<string, VariationProgress | undefined>>;
  locale: SiteLocale;
  ready: boolean;
  signedIn: boolean;
}) {
  const items = useMemo(
    () => (ready && signedIn ? continueRail(courses, progress, new Date()) : []),
    [courses, progress, ready, signedIn],
  );
  if (items.length === 0) {
    return null;
  }
  return (
    <section aria-labelledby="continue-rail-heading" className="mt-6">
      <h2 id="continue-rail-heading" className="text-lg font-semibold text-studio-fg">
        {tCourse(locale, "course.rail.heading")}
      </h2>
      <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((item) => {
          const { course } = item;
          const cover = courseImageUrl(course.coverUrl);
          const courseHref = `/courses/${course.slug}`;
          const href = item.nextLineId ? `${courseHref}/${item.nextLineId}` : courseHref;
          return (
            <li
              key={course.id}
              className="flex flex-col overflow-hidden rounded-xl border border-studio-border bg-studio-chrome hover:border-studio-border-strong"
            >
              <Link
                href={href}
                aria-label={tCourse(locale, "course.rail.openAria", { title: course.title })}
                className="block"
              >
                <div className="aspect-video bg-studio-hover">
                  {cover ? (
                    // eslint-disable-next-line @next/next/no-img-element -- arbitrary user-supplied https cover URL
                    <img src={cover} alt="" className="h-full w-full object-cover" />
                  ) : null}
                </div>
                <div className="p-3">
                  <div className="truncate text-body font-semibold text-studio-fg">{course.title}</div>
                  <ProgressBar
                    className="mt-2 h-1.5 bg-studio-hover"
                    value={item.percent}
                    label={tCourse(locale, "course.catalog.progressAria", { title: course.title })}
                  />
                  {item.nextLineTitle ? (
                    <div className="mt-2 truncate text-caption text-studio-muted">
                      {tCourse(locale, "course.rail.next", { line: item.nextLineTitle })}
                    </div>
                  ) : null}
                </div>
              </Link>
              {item.dueCount > 0 ? (
                <div className="px-3 pb-3">
                  {/* Courses 27/27 swaps this target for the review session. A sibling of the
                      item link, never nested inside it. */}
                  <Link
                    href={courseHref}
                    aria-label={tCourse(locale, "course.rail.reviewAria", {
                      count: formatInteger(locale, item.dueCount),
                      title: course.title,
                    })}
                    className="inline-block"
                  >
                    <Badge tone="accent">
                      {tCourse(locale, "course.rail.review", { count: formatInteger(locale, item.dueCount) })}
                    </Badge>
                  </Link>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
