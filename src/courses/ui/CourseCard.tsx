import Link from "next/link";
import { catalogCoursePercent, courseThemeLabel } from "../catalog";
import { courseSummaryText } from "../description";
import { courseImageUrl } from "../media";
import { nextLineId } from "../next-line";
import type { CatalogCourse, VariationProgress } from "../types";
import { tCourse } from "@/src/i18n/course-strings";
import { formatCourseDuration, formatInteger } from "@/src/i18n/format";
import type { SiteLocale } from "@/src/i18n/locale";
import { ProgressBar } from "@/src/site/ui/ProgressBar";
import { Skeleton } from "@/src/site/ui/Skeleton";
import { Badge } from "@/src/studio/ui/Controls";

/**
 * Catalog card: fit metadata (level, color, size, duration) and the next
 * action. The card is an article, not a link, so the title link and the
 * Start/Continue link are the only interactive elements. Progress renders
 * only once `ready`, so a card never shows 0% and then jumps.
 */
export function CourseCard({
  course,
  locale,
  progress,
  ready,
}: {
  course: CatalogCourse;
  locale: SiteLocale;
  progress: Readonly<Record<string, VariationProgress | undefined>>;
  ready: boolean;
}) {
  const cover = courseImageUrl(course.coverUrl);
  const percent = catalogCoursePercent(course, progress as Record<string, VariationProgress>);
  // Started = any line opened past its first move or learned, not only a learned one.
  const started =
    ready && course.variationIds.some((id) => Boolean(progress[id]?.learned) || (progress[id]?.step ?? 0) > 0);
  const next = ready ? nextLineId(course.variationIds, progress) : null;
  const href = next ? `/courses/${course.slug}/${next}` : `/courses/${course.slug}`;
  const courseHref = `/courses/${course.slug}`;
  const hasElo = course.eloMin !== null && course.eloMax !== null;
  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-studio-border bg-studio-chrome hover:border-studio-border-strong">
      <div className="aspect-video bg-studio-hover">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element -- cover is an arbitrary user-supplied https URL; next/image would need a per-host remotePatterns allowlist
          <img src={cover} alt="" className="h-full w-full object-cover" />
        ) : null}
      </div>
      <div className="flex flex-1 flex-col p-5">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="accent">{tCourse(locale, `course.catalog.level.${course.level}`)}</Badge>
          {hasElo ? (
            <Badge>
              {tCourse(locale, "course.catalog.elo", {
                min: formatInteger(locale, course.eloMin as number),
                max: formatInteger(locale, course.eloMax as number),
              })}
            </Badge>
          ) : null}
          <span className="text-caption uppercase tracking-wide text-studio-accent-text">
            {tCourse(locale, "course.catalog.cardThemeColor", {
              theme: courseThemeLabel(course.theme, locale),
              color: tCourse(
                locale,
                course.color === "black" ? "course.catalog.color.black" : "course.catalog.color.white",
              ),
            })}
          </span>
        </div>
        <h2 className="mt-2 text-lg font-semibold text-studio-fg">
          <Link href={courseHref} className="hover:underline">
            {course.title}
          </Link>
        </h2>
        {course.authorName ? (
          <p className="mt-1 text-caption text-studio-muted">
            {tCourse(locale, "course.catalog.by", { author: course.authorName })}
          </p>
        ) : null}
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
          {course.durationMinutes ? ` · ${formatCourseDuration(locale, course.durationMinutes)}` : null}
        </div>
        <div className="mt-auto pt-4">
          {!ready ? (
            <div className="text-caption">
              <Skeleton className="h-1.5 w-full" />
              <Skeleton className="mt-1 w-1/3" />
              <Skeleton className="mt-3 h-9 w-full rounded-lg" />
            </div>
          ) : (
            <>
              {started ? (
                <>
                  <ProgressBar
                    className="h-1.5 bg-studio-hover"
                    value={percent}
                    label={tCourse(locale, "course.catalog.progressAria", { title: course.title })}
                  />
                  <div className="mt-1 text-caption text-studio-muted">
                    {tCourse(locale, "course.catalog.percentComplete", {
                      percent: formatInteger(locale, percent),
                    })}
                  </div>
                </>
              ) : null}
              <Link
                href={href}
                aria-label={tCourse(locale, started ? "course.catalog.continueAria" : "course.catalog.startAria", {
                  title: course.title,
                })}
                className="mt-3 flex h-9 items-center justify-center rounded-lg bg-studio-accent px-4 text-body font-semibold text-studio-accent-fg hover:bg-studio-accent-strong"
              >
                {tCourse(locale, started ? "course.catalog.continue" : "course.catalog.start")}
              </Link>
            </>
          )}
        </div>
      </div>
    </article>
  );
}
