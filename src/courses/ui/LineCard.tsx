"use client";

import Link from "next/link";
import { tCourse } from "@/src/i18n/course-strings";
import { formatInteger } from "@/src/i18n/format";
import type { SiteLocale } from "@/src/i18n/locale";
import { studyStatus, type StudyStatus } from "../review";
import type { CourseVariation, VariationProgress } from "../types";

const BADGE_KEY = {
  new: "course.line.badge.new",
  learned: "course.line.learned",
  review: "course.line.badge.review",
} as const;

// The label always spells the status out; the color only reinforces it.
const BADGE_CLASS: Record<StudyStatus, string> = {
  new: "border-studio-border bg-studio-hover-subtle text-studio-muted",
  learned: "border-studio-border bg-studio-hover-subtle text-studio-success",
  review: "border-studio-border bg-studio-hover-subtle text-studio-warning-fg",
};

/**
 * SIG-1362: one line of the open chapter. Shows its order within the chapter,
 * the title and the study status badge (Novo / Aprendida / Revisar); the whole
 * card opens the lesson.
 */
export function LineCard({
  courseSlug,
  variation,
  number,
  progress,
  locale,
  now,
}: {
  courseSlug: string;
  variation: CourseVariation;
  /** 1-based position inside the chapter. */
  number: number;
  progress: Readonly<Record<string, VariationProgress | undefined>>;
  locale: SiteLocale;
  now: Date;
}) {
  const status = studyStatus(progress[variation.id], now);
  return (
    <li>
      <Link
        href={`/courses/${courseSlug}/${variation.id}`}
        className="flex items-center gap-3 rounded-lg border border-studio-border bg-studio-chrome px-3 py-2.5 hover:border-studio-border-strong hover:bg-studio-hover"
      >
        <span
          aria-hidden
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-studio-hover text-caption font-medium tabular-nums text-studio-muted"
        >
          {formatInteger(locale, number)}
        </span>
        <span className="sr-only">{tCourse(locale, "course.line.order", { n: formatInteger(locale, number) })}</span>
        <span className="min-w-0 flex-1 truncate text-body text-studio-fg">{variation.title}</span>
        <span
          className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-caption font-medium ${BADGE_CLASS[status]}`}
        >
          {tCourse(locale, BADGE_KEY[status])}
        </span>
      </Link>
    </li>
  );
}
