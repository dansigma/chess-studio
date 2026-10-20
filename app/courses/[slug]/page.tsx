import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CourseView } from "@/src/courses/CourseView";
import { COURSE_SELECT_FIELDS, MISSING_SCHEMA_NOTICE, isMissingSchemaError, isPublishedCourse, toCourse } from "@/src/courses/catalog";
import { courseSummaryText } from "@/src/courses/description";
import { SEED_COURSES } from "@/src/courses/seed";
import { SITE_NAME } from "@/src/site/sections";
import type { Course } from "@/src/courses/types";
import { createPublicServerSupabase } from "@/src/lib/supabase/server";

// Rendered on demand (no ISR / generateStaticParams): the root layout opts every page into dynamic
// rendering so the CSP nonce from proxy.ts can be applied (SIG-1033).

async function loadCourse(slug: string): Promise<{ course: Course | null; notice: string | null }> {
  const supabase = createPublicServerSupabase();
  let schemaMissing = false;
  if (supabase) {
    const { data, error } = await supabase.from("courses").select(COURSE_SELECT_FIELDS).eq("slug", slug).maybeSingle();
    if (error && !isMissingSchemaError(error)) {
      // A genuine DB failure is a 500 (error boundary), not a 404: only a
      // missing schema falls through to the built-in seed below.
      throw new Error("Course could not be loaded.");
    }
    schemaMissing = isMissingSchemaError(error);
    const published = data ? toCourse(data) : null;
    // SIG-861: a draft slug falls through to seed, then 404 for anon.
    if (published && isPublishedCourse(published)) {
      return { course: published, notice: null };
    }
  }
  return {
    course: SEED_COURSES.find((course) => course.slug === slug) ?? null,
    notice: schemaMissing ? MISSING_SCHEMA_NOTICE : null,
  };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  let course: Course | null = null;
  try {
    ({ course } = await loadCourse(slug));
  } catch {
    course = null;
  }
  if (!course) {
    return { title: `Course not found · ${SITE_NAME}` };
  }
  return {
    title: `${course.title} · ${SITE_NAME}`,
    description: courseSummaryText(course.summary) || "Study this course move by move with the explanation beside the board.",
  };
}

export default async function CoursePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { course, notice } = await loadCourse(slug);
  if (!course) {
    notFound();
  }
  return (
    <>
      {notice ? (
        <p className="border-b border-studio-border bg-studio-chrome px-6 py-2 text-center text-caption text-studio-warning-fg">
          {notice}
        </p>
      ) : null}
      <CourseView course={course} />
    </>
  );
}
