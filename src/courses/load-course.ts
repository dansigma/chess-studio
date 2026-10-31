import { COURSE_SELECT_FIELDS, MISSING_SCHEMA_NOTICE, isMissingSchemaError, isPublishedCourse, toCourse } from "@/src/courses/catalog";
import { SEED_COURSES } from "@/src/courses/seed";
import type { Course } from "@/src/courses/types";
import { createPublicServerSupabase } from "@/src/lib/supabase/server";

export async function loadCourse(slug: string): Promise<{ course: Course | null; notice: string | null }> {
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
