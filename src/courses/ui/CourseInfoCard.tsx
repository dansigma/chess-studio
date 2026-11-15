"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { tCourse } from "@/src/i18n/course-strings";
import { formatInteger } from "@/src/i18n/format";
import type { SiteLocale } from "@/src/i18n/locale";
import { courseThemeLabel } from "../catalog";
import { nextLineId } from "../next-line";
import type { Course, CourseLevel, VariationProgress } from "../types";

const LEVELS: readonly CourseLevel[] = ["beginner", "intermediate", "advanced"];

/** "≈ 3 h 20 min" / "≈ 45 min" / "≈ 2 h". Private to the info card. */
function durationLabel(locale: SiteLocale, minutes: number): string {
  const total = Math.max(1, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  const hText = formatInteger(locale, h);
  const mText = formatInteger(locale, m);
  if (h === 0) {
    return tCourse(locale, "course.info.durationMinutes", { m: mText });
  }
  if (m === 0) {
    return tCourse(locale, "course.info.durationHours", { h: hText });
  }
  return tCourse(locale, "course.info.durationHoursMinutes", { h: hText, m: mText });
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2 text-body">
      <dt className="text-studio-muted">{label}</dt>
      <dd className="text-right text-studio-fg">{children}</dd>
    </div>
  );
}

/**
 * SIG-1358: sticky side card. `ready` is false until progress has loaded; until
 * then the button is the stable "Começar curso" linking to the first line.
 */
export function CourseInfoCard({
  course,
  progress,
  ready,
  locale,
}: {
  course: Course;
  progress: Readonly<Record<string, VariationProgress | undefined>>;
  ready: boolean;
  locale: SiteLocale;
}) {
  const chapters = course.chapters.filter((chapter) => chapter.variations.length > 0);
  const ids = chapters.flatMap((chapter) => chapter.variations.map((variation) => variation.id));
  const hasProgress = ready && ids.some((id) => progress[id]?.learned || (progress[id]?.step ?? 0) > 0);
  const targetId = (hasProgress ? nextLineId(ids, progress) : null) ?? ids[0] ?? null;
  const href = targetId ? `/courses/${course.slug}/${targetId}` : `/courses/${course.slug}`;
  const levelLabel = tCourse(locale, `course.info.level.${course.level}`);
  const levelIndex = LEVELS.indexOf(course.level);
  const lineCount =
    ids.length === 1
      ? tCourse(locale, "course.catalog.lines.one")
      : tCourse(locale, "course.catalog.lines.other", { count: formatInteger(locale, ids.length) });
  const chapterCount =
    chapters.length === 1
      ? tCourse(locale, "course.catalog.chapters.one")
      : tCourse(locale, "course.catalog.chapters.other", { count: formatInteger(locale, chapters.length) });

  return (
    <aside className="rounded-xl border border-studio-border bg-studio-chrome p-4 lg:sticky lg:top-6">
      <div role="img" aria-label={tCourse(locale, "course.info.levelAria", { level: levelLabel })}>
        <ol className="grid grid-cols-3 gap-1" aria-hidden>
          {LEVELS.map((level, index) => (
            <li key={level} data-current={level === course.level ? "true" : undefined}>
              <div className={`h-1.5 rounded-full ${index <= levelIndex ? "bg-studio-accent" : "bg-studio-hover-strong"}`} />
              <div
                className={`mt-1 text-center text-caption ${
                  level === course.level ? "font-semibold text-studio-fg" : "text-studio-faint"
                }`}
              >
                {tCourse(locale, `course.info.level.${level}`)}
              </div>
            </li>
          ))}
        </ol>
      </div>
      {course.eloMin !== null && course.eloMax !== null ? (
        <p className="mt-2 text-center text-caption text-studio-muted">
          {tCourse(locale, "course.info.elo", {
            min: formatInteger(locale, course.eloMin),
            max: formatInteger(locale, course.eloMax),
          })}
        </p>
      ) : null}
      <dl className="mt-3 divide-y divide-studio-border border-y border-studio-border">
        <Row label={tCourse(locale, "course.info.content")}>
          {lineCount} · {chapterCount}
        </Row>
        {course.durationMinutes !== null ? (
          <Row label={tCourse(locale, "course.info.duration")}>{durationLabel(locale, course.durationMinutes)}</Row>
        ) : null}
        <Row label={tCourse(locale, "course.info.language")}>
          {tCourse(locale, `course.info.language.${course.language}`)}
        </Row>
        <Row label={tCourse(locale, "course.info.color")}>
          {tCourse(locale, course.color === "black" ? "course.info.color.black" : "course.info.color.white")}
        </Row>
        <Row label={tCourse(locale, "course.info.theme")}>{courseThemeLabel(course.theme, locale)}</Row>
      </dl>
      <Link
        href={href}
        className="mt-4 inline-flex h-8 w-full items-center justify-center rounded-lg bg-studio-accent px-3.5 text-body font-medium text-studio-accent-fg hover:bg-studio-accent-strong"
      >
        {tCourse(locale, hasProgress ? "course.info.continue" : "course.info.start")}
      </Link>
    </aside>
  );
}
