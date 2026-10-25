import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CourseView } from "@/src/courses/CourseView";
import { COURSE_SELECT_FIELDS, MISSING_SCHEMA_NOTICE, isMissingSchemaError, isPublishedCourse, toCourse } from "@/src/courses/catalog";
import { courseSummaryText } from "@/src/courses/description";
import { SEED_COURSES } from "@/src/courses/seed";
import { SITE_NAME } from "@/src/site/sections";
import type { Course } from "@/src/courses/types";
import { isSupabaseConfigured } from "@/src/lib/supabase/env";
import { createPublicServerSupabase } from "@/src/lib/supabase/server";

// ISR with on-demand params: pre-rendered slugs revalidate every 60s and a
// newly published slug renders on first visit (dynamicParams), so visitors
// see it within the window without a redeploy.
export const revalidate = 60;
export const dynamicParams = true;

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

async function loadAllSlugs(): Promise<string[]> {
  const slugs = new Set(SEED_COURSES.map((course) => course.slug));
  const supabase = createPublicServerSupabase();
  if (supabase) {
    // SIG-861: drafts never pre-render — skip non-published rows.
    // SIG-1050: status is the source of truth.
    const { data } = await supabase.from("courses").select("slug").eq("status", "published");
    for (const row of data ?? []) {
      if (typeof row.slug === "string" && row.slug) {
        slugs.add(row.slug);
      }
    }
  }
  return [...slugs];
}

export async function generateStaticParams(): Promise<{ slug: string }[]> {
  if (!isSupabaseConfigured()) {
    return [];
  }
  try {
    return (await loadAllSlugs()).map((slug) => ({ slug }));
  } catch {
    return [];
  }
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
