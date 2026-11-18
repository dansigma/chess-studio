"use client";

import Link from "next/link";
import { ArrowLeft, ChevronRight, ListTree, Video } from "lucide-react";
import { tCourse } from "@/src/i18n/course-strings";
import { formatInteger } from "@/src/i18n/format";
import type { SiteLocale } from "@/src/i18n/locale";
import type { Course, CourseChapter, VariationProgress } from "../types";
import { LineCard } from "./LineCard";
import { VideoEmbed } from "./VideoEmbed";

/** The chapter path: the video lesson first, then the practical lines. */
function ChapterTrack({ hasVideo, locale }: { hasVideo: boolean; locale: SiteLocale }) {
  return (
    <ol
      aria-label={tCourse(locale, "course.chapter.trackAria")}
      className="mt-6 flex flex-wrap items-center gap-x-2 gap-y-2 text-caption"
    >
      <li
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 ${
          hasVideo
            ? "border-studio-border bg-studio-chrome text-studio-fg"
            : "border-studio-border-subtle text-studio-muted"
        }`}
      >
        <Video size={14} aria-hidden />
        {tCourse(locale, "course.chapter.videoStep")}
      </li>
      <li className="inline-flex items-center gap-1.5 rounded-full bg-studio-selected px-3 py-1 font-medium text-studio-fg">
        <ChevronRight size={14} aria-hidden />
        <ListTree size={14} aria-hidden />
        {tCourse(locale, "course.chapter.linesStep")}
      </li>
    </ol>
  );
}

/**
 * SIG-1362: the open chapter. Video (when set) and description at the top,
 * the video → lines path, then one card per line. `?capitulo=N` is read by the
 * caller, so reload and Back land on the same chapter.
 */
export function ChapterDetail({
  course,
  courseHref,
  chapter,
  number,
  progress,
  locale,
  now = new Date(),
}: {
  course: Course;
  courseHref?: string;
  chapter: CourseChapter;
  /** 1-based chapter position in the grid. */
  number: number;
  progress: Readonly<Record<string, VariationProgress | undefined>>;
  locale: SiteLocale;
  now?: Date;
}) {
  const description = chapter.description?.trim() ?? "";
  const hasVideo = chapter.hasVideo === true || Boolean(chapter.videoUrl);
  const base = courseHref ?? `/courses/${course.slug}`;
  return (
    <section className="mt-8" aria-labelledby="course-chapter-heading">
      <Link
        href={base}
        className="inline-flex items-center gap-1.5 text-caption font-medium text-studio-accent-text hover:underline"
      >
        <ArrowLeft size={14} aria-hidden />
        {tCourse(locale, "course.chapter.allChapters")}
      </Link>
      <p className="mt-5 text-caption uppercase tracking-wide text-studio-muted">
        {tCourse(locale, "course.course.chapterHeading", { n: formatInteger(locale, number) })}
      </p>
      <h2 id="course-chapter-heading" className="mt-1 text-title font-semibold text-studio-fg">
        {chapter.title}
      </h2>
      <VideoEmbed url={chapter.videoUrl} title={chapter.title} />
      {description ? <p className="mt-4 whitespace-pre-line text-body text-studio-muted">{description}</p> : null}
      <ChapterTrack hasVideo={hasVideo} locale={locale} />
      <ul aria-label={tCourse(locale, "course.chapter.linesStep")} className="mt-3 space-y-2">
        {chapter.variations.map((variation, index) => (
          <LineCard
            key={variation.id}
            courseSlug={course.slug}
            courseHref={base}
            variation={variation}
            number={index + 1}
            progress={progress}
            locale={locale}
            now={now}
          />
        ))}
      </ul>
    </section>
  );
}
