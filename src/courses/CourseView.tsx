"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { importPgn } from "@/src/chess/pgn";
import { writeCourseStudyImport } from "@/src/chess/share-board";
import { tCourse } from "@/src/i18n/course-strings";
import { lessonFrames } from "./lesson.ts";
import { CourseChrome } from "./CourseChrome";
import { CourseOverview } from "./ui/CourseOverview";
import { CourseProgressHeader } from "./ui/CourseProgressHeader";
import { CourseInfoCard } from "./ui/CourseInfoCard";
import { CourseSyllabus } from "./ui/CourseSyllabus";
import { courseVariationIds } from "./store";
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

  const variationIds = courseVariationIds(course);

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
      </main>
    </div>
  );
}
