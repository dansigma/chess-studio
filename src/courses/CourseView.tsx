"use client";

import { Suspense, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { importPgn } from "@/src/chess/pgn";
import { writeCourseStudyImport } from "@/src/chess/share-board";
import { tCourse } from "@/src/i18n/course-strings";
import type { SiteLocale } from "@/src/i18n/locale";
import { lessonFrames } from "./lesson.ts";
import { CourseChrome } from "./CourseChrome";
import { CourseOverview } from "./ui/CourseOverview";
import { CourseProgressHeader } from "./ui/CourseProgressHeader";
import { CourseInfoCard } from "./ui/CourseInfoCard";
import { CourseSyllabus } from "./ui/CourseSyllabus";
import { ChapterDetail } from "./ui/ChapterDetail";
import { ChapterGrid } from "./ui/ChapterGrid";
import { CHAPTER_PARAM, chapterIndex } from "./chapter-param";
import { hasCourseProgress } from "./progress-summary";
import { courseVariationIds } from "./store";
import { checkCourseAccess, recordEnrollment } from "./enrollment";
import { createBrowserSupabase } from "@/src/lib/supabase/client";
import type { Course, VariationProgress } from "./types";
import { useCourseContent } from "./use-course-content";
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

  const variationIds = courseVariationIds(course);
  // SIG-1362: students with progress study from the chapter grid; everyone
  // else keeps the syllabus. Progress is client-only, so the switch happens
  // once `ready` — never during the prerender.
  const studentGrid = ready && hasCourseProgress(course, progress);

  return (
    <div className="min-h-full bg-studio-bg">
      <CourseChrome admin={admin} isAdmin={isAdmin} />
      <main className="mx-auto max-w-5xl px-6 py-8">
        <CourseProgressHeader course={course} progress={progress} ready={ready} locale={locale} />
        <CourseOverview
          course={course}
          locale={locale}
          aside={<CourseInfoCard course={course} progress={progress} ready={ready} locale={locale} />}
        />
        {variationIds.length > 0 ? <div className="mt-5">
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

        {studentGrid ? (
          // useSearchParams inside opts this subtree out of the prerender; the
          // page itself keeps its ISR HTML and the URL keeps the open chapter.
          <Suspense fallback={null}>
            <CourseChapters course={course} progress={progress} locale={locale} />
          </Suspense>
        ) : (
          <CourseSyllabus
            course={course}
            locale={locale}
            progress={progress}
            frameCounts={frameCounts}
            onOpenInStudio={(variation) => {
              const written = writeCourseStudyImport({
                title: `${course.title} — ${variation.title}`,
                pgn: variation.pgn,
              });
              router.push(written ? "/studio" : `/courses/${course.slug}/${variation.id}`);
            }}
          />
        )}
      </main>
    </div>
  );
}

/**
 * SIG-1362: the enrolled student's chapter area. Reads `?capitulo=N` from the
 * address and shows the chapter detail or, without a valid chapter, the grid.
 * The gated course content fills in chapter video links and descriptions for
 * outline-only courses.
 */
function CourseChapters({
  course,
  progress,
  locale,
}: {
  course: Course;
  progress: Record<string, VariationProgress>;
  locale: SiteLocale;
}) {
  const searchParams = useSearchParams();
  const content = useCourseContent(course);
  const chapters = useMemo(() => {
    const source =
      course.contentLoaded === false && content.status === "ready" ? content.chapters : course.chapters;
    return source.filter((chapter) => chapter.variations.length > 0);
  }, [course, content]);
  const index = chapterIndex(searchParams.get(CHAPTER_PARAM), chapters.length);
  if (index === null) {
    return <ChapterGrid course={course} chapters={chapters} progress={progress} locale={locale} />;
  }
  return (
    <ChapterDetail
      course={course}
      chapter={chapters[index]}
      number={index + 1}
      progress={progress}
      locale={locale}
    />
  );
}
