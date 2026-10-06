import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CourseView } from "@/src/courses/CourseView";
import { isCourseColor, isCourseTheme, parseChapters } from "@/src/courses/catalog";
import { courseSummaryText } from "@/src/courses/description";
import { courseImageUrl } from "@/src/courses/media";
import { SEED_COURSES } from "@/src/courses/seed";
import type { Course } from "@/src/courses/types";
import type { Json } from "@/src/lib/supabase/database.types";
import { isSupabaseConfigured } from "@/src/lib/supabase/env";
import { createPublicServerSupabase } from "@/src/lib/supabase/server";

// ISR with on-demand params: pre-rendered slugs revalidate every 60s and a
// newly published slug renders on first visit (dynamicParams), so visitors
// see it within the window without a redeploy.
export const revalidate = 60;
export const dynamicParams = true;

const COURSE_FIELDS = "id, slug, title, summary, color, theme, chapters, cover_url, video_url" as const;

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
    const { data } = await supabase.from("courses").select(COURSE_FIELDS).eq("slug", slug).maybeSingle();
    const published = data ? toCourse(data) : null;
    if (published) {
      return published;
    }
  }
  return SEED_COURSES.find((course) => course.slug === slug) ?? null;
}

async function loadAllSlugs(): Promise<string[]> {
  const slugs = new Set(SEED_COURSES.map((course) => course.slug));
  const supabase = createPublicServerSupabase();
  if (supabase) {
    const { data } = await supabase.from("courses").select("slug");
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
    course = await loadCourse(slug);
  } catch {
    course = null;
  }
  if (!course) {
    return { title: "Course not found · Xadrez Digital" };
  }
  return {
    title: `${course.title} · Xadrez Digital`,
    description: courseSummaryText(course.summary) || "Study this course move by move with the explanation beside the board.",
  };
}

export default async function CoursePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const course = await loadCourse(slug);
  if (!course) {
    notFound();
  }
  return <CourseView course={course} />;
}
