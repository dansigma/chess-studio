"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Circle, CircleDot } from "lucide-react";
import { importPgn } from "@/src/chess/pgn";
import { writeCourseStudyImport } from "@/src/chess/share-board";
import { tCourse } from "@/src/i18n/course-strings";
import { formatInteger } from "@/src/i18n/format";
import { lessonFrames, lineProgressLabel } from "./lesson";
import { CourseChrome } from "./CourseChrome";
import { ProgressBar } from "@/src/site/ui/ProgressBar";
import { CourseOverview } from "./ui/CourseOverview";
import { CourseInfoCard } from "./ui/CourseInfoCard";
import { ChapterStudioMenu } from "./ui/ChapterStudioMenu";
import { coursePercent, courseVariationIds } from "./store";
import { checkCourseAccess, recordEnrollment } from "./enrollment";
import { createBrowserSupabase } from "@/src/lib/supabase/client";
import type { Course } from "./types";
import { useCourseData } from "./use-courses";
import { useStudioStore } from "@/src/store/studio-store";

export function CourseView({ course }: { course: Course }) {
  const router = useRouter();
  const locale = useStudioStore((state) => state.settings.locale);
  const { progress, admin, isAdmin, ready, signedIn, userId, source } = useCourseData();

  // SIG-1052: first open per signed-in user and course. Fires once per
  // session via the module guard inside recordEnrollment; anonymous visitors
  // and built-in seed courses record nothing. SIG-1177: gated on course
  // access — a signed-in user without access (locked premium landing) must
  // not create an enrollment row. The access decision comes from the existing
  // public.can_access_course gate (same source of truth as the lesson
  // content read); failures close the gate without throwing.
  useEffect(() => {
    if (!signedIn || !userId || course.builtin) {
      return;
    }
    const supabase = createBrowserSupabase();
    if (!supabase) {
      return;
    }
    void (async () => {
      if (!(await checkCourseAccess(supabase, course.id))) {
        return;
      }
      await recordEnrollment(supabase, userId, course.id);
    })();
  }, [signedIn, userId, course.builtin, course.id]);

  const frameCounts = useMemo(() => {
    const counts: Record<string, number | null> = {};
    for (const chapter of course.chapters) {
      for (const variation of chapter.variations) {
        // An outline variation (pgn: "") has no moves loaded yet: the count is unknown.
        counts[variation.id] = variation.pgn.trim()
          ? lessonFrames(importPgn(variation.pgn).tree, course.color).length
          : null;
      }
    }
    return counts;
  }, [course]);

  const percent = coursePercent(course, progress);
  const variationIds = courseVariationIds(course);
  const learnedCount = variationIds.filter((id) => progress[id]?.learned).length;
  const startedCount = variationIds.filter((id) => (progress[id]?.step ?? 0) > 0 && !progress[id]?.learned).length;

  return (
    <div className="min-h-full bg-studio-bg">
      <CourseChrome admin={admin} isAdmin={isAdmin} />
      <main className="mx-auto max-w-5xl px-6 py-8">
        <CourseOverview
          course={course}
          locale={locale}
          aside={<CourseInfoCard course={course} progress={progress} ready={ready} locale={locale} />}
        />
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
          <ProgressBar value={percent} label={tCourse(locale, "course.course.progressAria")} />
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
              <header className="flex items-center justify-between gap-3 bg-studio-chrome px-4 py-3">
                <div className="min-w-0">
                  <div className="text-caption uppercase tracking-wide text-studio-muted">
                    {tCourse(locale, "course.course.chapterHeading", { n: formatInteger(locale, chapterIndex + 1) })}
                  </div>
                  <h2 className="text-body font-semibold text-studio-fg">{chapter.title}</h2>
                </div>
                <ChapterStudioMenu
                  variations={chapter.variations}
                  locale={locale}
                  onOpen={(variation) => {
                    const written = writeCourseStudyImport({
                      title: `${course.title} — ${variation.title}`,
                      pgn: variation.pgn,
                    });
                    router.push(written ? "/studio" : `/courses/${course.slug}/${variation.id}`);
                  }}
                />
              </header>
              <ul>
                {chapter.variations.map((variation) => {
                  const saved = progress[variation.id];
                  const label = lineProgressLabel(saved, frameCounts[variation.id] ?? null, locale);
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
