import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LessonView } from "@/src/courses/LessonView";
import { isCourseColor, isCourseTheme, mergeCourseLists, parseChapters } from "@/src/courses/catalog";
import { courseImageUrl } from "@/src/courses/media";
import { SEED_COURSES } from "@/src/courses/seed";
import { findVariation } from "@/src/courses/store";
import type { Course } from "@/src/courses/types";
import type { Json } from "@/src/lib/supabase/database.types";
import { isSupabaseConfigured } from "@/src/lib/supabase/env";
import { createPublicServerSupabase } from "@/src/lib/supabase/server";

// Same ISR choice as the course page: pre-rendered lines revalidate every
// 60s and newly published lines render on first visit (dynamicParams).
export const revalidate = 60;
export const dynamicParams = true;

function toCourse(row: {
  id: string;
  slug: string;
  title: string;
  summary: string;
  cover_url: string | null;
  video_url: string | null;
  theme: string;
  color: string;
  chapters: Json;
}): Course | null {
  if (!isCourseColor(row.color) || !isCourseTheme(row.theme)) {
    return null;
  }
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    coverUrl: courseImageUrl(row.cover_url) ?? undefined,
    videoUrl: row.video_url ?? undefined,
    theme: row.theme,
    color: row.color,
    chapters: parseChapters(row.chapters),
    builtin: false,
  };
}

async function loadCourse(slug: string): Promise<Course | null> {
  const supabase = createPublicServerSupabase();
  if (supabase) {
    const { data } = await supabase
      .from("courses")
      .select("id, slug, title, summary, color, theme, chapters, cover_url, video_url")
      .eq("slug", slug)
      .maybeSingle();
    const published = data ? toCourse(data) : null;
    if (published) {
      return published;
    }
  }
  return SEED_COURSES.find((course) => course.slug === slug) ?? null;
}

async function loadAllLines(): Promise<{ slug: string; variationId: string }[]> {
  const supabase = createPublicServerSupabase();
  const published: Course[] = [];
  if (supabase) {
    const { data } = await supabase.from("courses").select("id, slug, title, summary, color, theme, chapters, cover_url, video_url");
    for (const row of data ?? []) {
      const course = toCourse(row);
      if (course) {
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
    course = await loadCourse(slug);
  } catch {
    course = null;
  }
  const found = course ? findVariation(course, variationId) : null;
  if (!course || !found) {
    return { title: "Line not found · Xadrez Digital" };
  }
  return {
    title: `${found.variation.title} · ${course.title} · Xadrez Digital`,
  };
}

export default async function LessonPage({
  params,
}: {
  params: Promise<{ slug: string; variationId: string }>;
}) {
  const { slug, variationId } = await params;
  const course = await loadCourse(slug);
  const found = course ? findVariation(course, variationId) : null;
  if (!course || !found) {
    notFound();
  }
  return <LessonView course={course} variationId={variationId} />;
}
