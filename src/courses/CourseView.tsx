"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Circle, CircleDot, ExternalLink } from "lucide-react";
import { importPgn } from "@/src/chess/pgn";
import { writeCourseStudyImport } from "@/src/chess/share-board";
import { courseThemeLabel } from "./catalog";
import { tCourse } from "@/src/i18n/course-strings";
import { formatInteger } from "@/src/i18n/format";
import { lessonFrames, lineProgressLabel } from "./lesson";
import { CourseSummary } from "./CourseSummary";
import { courseImageUrl, courseVideo } from "./media";
import { CourseChrome } from "./CourseChrome";
import { coursePercent, courseVariationIds } from "./store";
import type { Course } from "./types";
import { useCourseData } from "./use-courses";
import { useStudioStore } from "@/src/store/studio-store";

export function CourseView({ course }: { course: Course }) {
  const router = useRouter();
  const locale = useStudioStore((state) => state.settings.locale);
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
              {courseThemeLabel(course.theme, locale)} ·{" "}
              {tCourse(locale, course.color === "black" ? "course.course.pieces.black" : "course.course.pieces.white")}
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
                sandbox="allow-scripts allow-same-origin allow-presentation"
                referrerPolicy="strict-origin-when-cross-origin"
              />
            )}
          </div>
        ) : null}
        {variationIds.length > 0 ? <div className="mt-5">
          <div className="mb-1 flex justify-between gap-3 text-caption text-studio-muted">
            <span>{tCourse(locale, "course.course.progressHeading")}</span>
            <span>
              {tCourse(locale, "course.course.learnedSummary", {
                learned: formatInteger(locale, learnedCount),
                total: formatInteger(locale, variationIds.length),
              })}
              {startedCount > 0
                ? ` · ${
                    startedCount === 1
                      ? tCourse(locale, "course.course.inProgress.one", {
                          count: formatInteger(locale, startedCount),
                        })
                      : tCourse(locale, "course.course.inProgress.other", {
                          count: formatInteger(locale, startedCount),
                        })
                  }`
                : ""}
            </span>
          </div>
          <div
            className="h-2 overflow-hidden rounded-full bg-studio-track"
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={tCourse(locale, "course.course.progressAria")}
          >
            <div className="h-full rounded-full bg-studio-accent" style={{ width: `${percent}%` }} />
          </div>
          {source === "account" ? (
            <p className="mt-2 text-caption text-studio-muted">{tCourse(locale, "course.course.savedAccount")}</p>
          ) : signedIn ? (
            <p className="mt-2 text-caption text-studio-warning-fg">{tCourse(locale, "course.catalog.browserOnly")}</p>
          ) : (
            <p className="mt-2 text-caption text-studio-muted">
              <Link href="/login" className="text-studio-accent-text">
                {tCourse(locale, "course.common.signIn")}
              </Link>{" "}
              {tCourse(locale, "course.catalog.signinSuffix")}
            </p>
          )}
        </div> : null}

        <div className="mt-8 space-y-6">
          {course.chapters.filter((chapter) => chapter.variations.length > 0).map((chapter, chapterIndex) => (
            <section key={chapter.id} className="overflow-hidden rounded-xl border border-studio-border">
              <header className="bg-studio-chrome px-4 py-3">
                <div className="text-caption uppercase tracking-wide text-studio-muted">
                  {tCourse(locale, "course.course.chapterHeading", { n: formatInteger(locale, chapterIndex + 1) })}
                </div>
                <h2 className="text-body font-semibold text-studio-fg">{chapter.title}</h2>
              </header>
              <ul>
                {chapter.variations.map((variation) => {
                  const saved = progress[variation.id];
                  const label = lineProgressLabel(saved, frameCounts[variation.id] ?? 0, locale);
                  const learned = Boolean(saved?.learned);
                  const started = !learned && (saved?.step ?? 0) > 0;
                  return (
                    <li key={variation.id} className="border-t border-studio-border">
                      <div className="flex items-center gap-2 px-4 py-3 hover:bg-studio-hover">
                        <Link
                          href={`/courses/${course.slug}/${variation.id}`}
                          className="flex min-w-0 flex-1 items-center gap-3"
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
                        <button
                          type="button"
                          title={tCourse(locale, "course.course.openInStudio")}
                          aria-label={tCourse(locale, "course.course.openInStudioAria", {
                            title: variation.title,
                          })}
                          className="flex shrink-0 items-center justify-center rounded-md p-1.5 text-studio-muted hover:bg-studio-hover-strong hover:text-studio-fg"
                          onClick={() => {
                            const written = writeCourseStudyImport({
                              title: `${course.title} — ${variation.title}`,
                              pgn: variation.pgn,
                            });
                            if (written) {
                              router.push("/studio");
                            } else {
                              router.push(`/courses/${course.slug}/${variation.id}`);
                            }
                          }}
                        >
                          <ExternalLink size={15} aria-hidden />
                        </button>
                      </div>
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
