"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Check, Circle, CircleDot } from "lucide-react";
import { importPgn } from "@/src/chess/pgn";
import { courseThemeLabel } from "./catalog";
import { lessonFrames, lineProgressLabel } from "./lesson";
import { CourseSummary } from "./DescriptionField";
import { courseImageUrl, courseVideo } from "./media";
import { CourseChrome } from "./CourseChrome";
import { coursePercent, courseVariationIds } from "./store";
import type { Course } from "./types";
import { useCourseData } from "./use-courses";

export function CourseView({ course }: { course: Course }) {
  const { progress, admin, signedIn, source } = useCourseData();

  const frameCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const chapter of course.chapters) {
      for (const variation of chapter.variations) {
        counts[variation.id] = lessonFrames(importPgn(variation.pgn).tree, course.color).length;
      }
    }
    return counts;
  }, [course]);

  const percent = coursePercent(course, progress);
  const cover = courseImageUrl(course.coverUrl);
  const video = courseVideo(course.videoUrl);
  const variationIds = courseVariationIds(course);
  const learnedCount = variationIds.filter((id) => progress[id]?.learned).length;
  const startedCount = variationIds.filter((id) => (progress[id]?.step ?? 0) > 0 && !progress[id]?.learned).length;

  return (
    <div className="min-h-full bg-studio-bg">
      <CourseChrome admin={admin} />
      <main className="mx-auto max-w-3xl px-6 py-8">
        <div className="flex items-start gap-4">
          <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-studio-border bg-studio-hover">
            {cover ? (
              // eslint-disable-next-line @next/next/no-img-element -- cover is an arbitrary user-supplied https URL; next/image would need a per-host remotePatterns allowlist
              <img src={cover} alt="" className="h-full w-full object-cover" />
            ) : null}
          </div>
          <div className="min-w-0">
            <p className="text-caption uppercase tracking-wide text-studio-faint">
              {courseThemeLabel(course.theme)} · {course.color === "black" ? "Black pieces" : "White pieces"}
            </p>
            <h1 className="mt-1 text-2xl font-semibold text-studio-fg">{course.title}</h1>
          </div>
        </div>
        <CourseSummary
          html={course.summary}
          className="mt-4 space-y-3 text-body leading-relaxed text-studio-muted [&_em]:italic [&_li+li]:mt-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_strong]:font-semibold [&_strong]:text-studio-fg [&_u]:underline [&_ul]:list-disc [&_ul]:pl-5"
        />
        {video ? (
          <div className="mt-5 overflow-hidden rounded-xl border border-studio-border bg-studio-chrome">
            {video.kind === "file" ? (
              <video src={video.src} controls className="aspect-video w-full bg-black" />
            ) : (
              <iframe
                src={video.src}
                title={course.title}
                className="aspect-video w-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            )}
          </div>
        ) : null}
        {variationIds.length > 0 ? <div className="mt-5">
          <div className="mb-1 flex justify-between gap-3 text-caption text-studio-muted">
            <span>Course progress</span>
            <span>
              {learnedCount} of {variationIds.length} learned
              {startedCount > 0 ? ` · ${startedCount} in progress` : ""}
            </span>
          </div>
          <div
            className="h-2 overflow-hidden rounded-full bg-studio-track"
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Course progress"
          >
            <div className="h-full rounded-full bg-studio-accent" style={{ width: `${percent}%` }} />
          </div>
          {source === "account" ? (
            <p className="mt-2 text-caption text-studio-muted">Saved to your account.</p>
          ) : signedIn ? (
            <p className="mt-2 text-caption text-studio-warning-fg">Progress is saved only in this browser.</p>
          ) : (
            <p className="mt-2 text-caption text-studio-muted">
              <Link href="/login" className="text-studio-accent-text">
                Sign in
              </Link>{" "}
              to keep progress on your account.
            </p>
          )}
        </div> : null}

        <div className="mt-8 space-y-6">
          {course.chapters.filter((chapter) => chapter.variations.length > 0).map((chapter, chapterIndex) => (
            <section key={chapter.id} className="overflow-hidden rounded-xl border border-studio-border">
              <header className="bg-studio-chrome px-4 py-3">
                <div className="text-caption uppercase tracking-wide text-studio-muted">
                  Chapter {chapterIndex + 1}
                </div>
                <h2 className="text-body font-semibold text-studio-fg">{chapter.title}</h2>
              </header>
              <ul>
                {chapter.variations.map((variation) => {
                  const saved = progress[variation.id];
                  const label = lineProgressLabel(saved, frameCounts[variation.id] ?? 0);
                  const learned = Boolean(saved?.learned);
                  const started = !learned && (saved?.step ?? 0) > 0;
                  return (
                    <li key={variation.id} className="border-t border-studio-border">
                      <Link
                        href={`/courses/${course.slug}/${variation.id}`}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-studio-hover"
                      >
                        {learned ? (
                          <Check size={16} className="shrink-0 text-studio-success" aria-hidden />
                        ) : started ? (
                          <CircleDot size={16} className="shrink-0 text-studio-accent-text" aria-hidden />
                        ) : (
                          <Circle size={16} className="shrink-0 text-studio-faint" aria-hidden />
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-body text-studio-fg">{variation.title}</span>
                          <span className={`block text-caption ${learned ? "text-studio-success" : "text-studio-muted"}`}>
                            {label}
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
