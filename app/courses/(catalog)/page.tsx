import type { Metadata } from "next";
import { CatalogView } from "@/src/courses/CatalogView";
import { isCourseColor, isCourseTheme, mergeCourseLists, parseChapters, toCatalogCourses } from "@/src/courses/catalog";
import { courseImageUrl } from "@/src/courses/media";
import { SEED_COURSES } from "@/src/courses/seed";
import type { Course } from "@/src/courses/types";
import { createPublicServerSupabase } from "@/src/lib/supabase/server";

// ISR: the catalog revalidates every 60s. A newly published course appears
// for visitors within the window; the publisher's own admin list is
// client-fetched and the catalog refreshes on next navigation/refresh.
// The fetch uses the cookie-free public client (no `cookies()` in the
// render path), so the route stays statically renderable.
//
// NB: this page lives in the `(catalog)` group so the catalog skeleton in
// `(catalog)/loading.tsx` does not wrap the `[slug]` segments. A loading
// above those segments puts a Suspense fallback between the layout and the
// page, and a `notFound()` thrown under a committed fallback keeps HTTP 200
// (verified). With the skeleton scoped to the catalog, a missing
// course/variation 404s with a real HTTP 404.
export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Courses · Xadrez Digital",
    description: "Pick a theme, open a course, and study move by move with the explanation beside the board.",
  };
}

async function loadCatalog(): Promise<Course[]> {
  const supabase = createPublicServerSupabase();
  if (!supabase) {
    return [...SEED_COURSES];
  }
  const { data, error } = await supabase
    .from("courses")
    .select("id, slug, title, summary, color, theme, chapters, cover_url, video_url")
    .order("updated_at", { ascending: false });
  if (error) {
    throw new Error("Published courses could not be loaded.");
  }
  const published: Course[] = [];
  for (const row of data ?? []) {
    if (!isCourseColor(row.color) || !isCourseTheme(row.theme)) {
      continue;
    }
    published.push({
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
    });
  }
  return mergeCourseLists(published, SEED_COURSES);
}

export default async function CoursesPage() {
  const courses = await loadCatalog();
  return <CatalogView courses={toCatalogCourses(courses)} />;
}
