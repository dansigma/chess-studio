import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LessonView } from "@/src/courses/LessonView";
import { COURSE_SELECT_FIELDS, MISSING_SCHEMA_NOTICE, isMissingSchemaError, isPublishedCourse, mergeCourseLists, toCourse } from "@/src/courses/catalog";
import { SEED_COURSES } from "@/src/courses/seed";
import { SITE_NAME } from "@/src/site/sections";
import { findVariation } from "@/src/courses/store";
import type { Course } from "@/src/courses/types";
import { isSupabaseConfigured } from "@/src/lib/supabase/env";
import { createPublicServerSupabase } from "@/src/lib/supabase/server";

// Same ISR choice as the course page: pre-rendered lines revalidate every
// 60s and newly published lines render on first visit (dynamicParams).
export const revalidate = 60;
export const dynamicParams = true;

async function loadCourse(slug: string): Promise<{ course: Course | null; notice: string | null }> {
  const supabase = createPublicServerSupabase();
  let schemaMissing = false;
  if (supabase) {
    const { data, error } = await supabase
      .from("courses")
      .select(COURSE_SELECT_FIELDS)
      .eq("slug", slug)
      .maybeSingle();
    if (error && !isMissingSchemaError(error)) {
      // A genuine DB failure is a 500 (error boundary), not a 404: only a
      // missing schema falls through to the built-in seed below.
      throw new Error("Course could not be loaded.");
    }
    schemaMissing = isMissingSchemaError(error);
    const published = data ? toCourse(data) : null;
    // SIG-861: a draft slug falls through to seed then 404 (mirrors [slug]/page.tsx).
    if (published && isPublishedCourse(published)) {
      return { course: published, notice: null };
    }
  }
  return {
    course: SEED_COURSES.find((course) => course.slug === slug) ?? null,
    notice: schemaMissing ? MISSING_SCHEMA_NOTICE : null,
  };
}

async function loadAllLines(): Promise<{ slug: string; variationId: string }[]> {
  const supabase = createPublicServerSupabase();
  const published: Course[] = [];
  if (supabase) {
    // SIG-1050: status is the source of truth for pre-render filtering.
    const { data } = await supabase.from("courses").select(COURSE_SELECT_FIELDS).eq("status", "published");
    for (const row of data ?? []) {
      const course = toCourse(row);
      // SIG-861: drafts never pre-render (mirrors [slug] loadAllSlugs).
      if (course && isPublishedCourse(course)) {
        published.push(course);
      }
    }
  }
  return mergeCourseLists(published, SEED_COURSES).flatMap((course) =>
    course.chapters.flatMap((chapter) =>
      chapter.variations.map((variation) => ({ slug: course.slug, variationId: variation.id })),
    ),
  );
}

export async function generateStaticParams(): Promise<{ slug: string; variationId: string }[]> {
  if (!isSupabaseConfigured()) {
    return [];
  }
  try {
    return await loadAllLines();
  } catch {
    return [];
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; variationId: string }>;
}): Promise<Metadata> {
  const { slug, variationId } = await params;
  let course: Course | null = null;
  try {
    ({ course } = await loadCourse(slug));
  } catch {
    course = null;
  }
  const found = course ? findVariation(course, variationId) : null;
  if (!course || !found) {
    return { title: `Line not found · ${SITE_NAME}` };
  }
  return {
    title: `${found.variation.title} · ${course.title} · ${SITE_NAME}`,
  };
}

export default async function LessonPage({
  params,
}: {
  params: Promise<{ slug: string; variationId: string }>;
}) {
  const { slug, variationId } = await params;
  const { course, notice } = await loadCourse(slug);
  const found = course ? findVariation(course, variationId) : null;
  if (!course || !found) {
    notFound();
  }
  return (
    <>
      {notice ? (
        <p className="border-b border-studio-border bg-studio-chrome px-6 py-2 text-center text-caption text-studio-warning-fg">
          {notice}
        </p>
      ) : null}
      <LessonView course={course} variationId={variationId} />
    </>
  );
}
