import type { Metadata } from "next";
import { CatalogView } from "@/src/courses/CatalogView";
import { COURSE_SELECT_FIELDS, MISSING_SCHEMA_NOTICE, isMissingSchemaError, mergeCourseLists, toCatalogCourses, toCourse } from "@/src/courses/catalog";
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

async function loadCatalog(): Promise<{ courses: Course[]; notice: string | null }> {
  const supabase = createPublicServerSupabase();
  if (!supabase) {
    return { courses: [...SEED_COURSES], notice: null };
  }
  const { data, error } = await supabase
    .from("courses")
    .select(COURSE_SELECT_FIELDS)
    .order("updated_at", { ascending: false });
  if (error) {
    // A missing table/schema (fresh project) is not a failure: serve the
    // built-in catalog with a notice, like the pre-RSC client path does.
    // Genuine failures reach the error boundary (HTTP 500), not an empty list.
    if (isMissingSchemaError(error)) {
      return { courses: [...SEED_COURSES], notice: MISSING_SCHEMA_NOTICE };
    }
    throw new Error("Published courses could not be loaded.");
  }
  const published: Course[] = [];
  for (const row of data ?? []) {
    const course = toCourse(row);
    if (course) {
      published.push(course);
    }
  }
  return { courses: mergeCourseLists(published, SEED_COURSES), notice: null };
}

export default async function CoursesPage() {
  const { courses, notice } = await loadCatalog();
  return (
    <>
      {notice ? (
        <p className="border-b border-studio-border bg-studio-chrome px-6 py-2 text-center text-caption text-studio-warning-fg">
          {notice}
        </p>
      ) : null}
      <CatalogView courses={toCatalogCourses(courses)} />
    </>
  );
}
