"use server";

import { isCourseSuperAdmin, userCanPublishCourses } from "@/src/lib/auth/course-permissions";
import type { Json } from "@/src/lib/supabase/database.types";
import { createServiceSupabase } from "@/src/lib/supabase/admin";
import { createServerSupabase } from "@/src/lib/supabase/server";
import { courseOwnershipError, courseSlugError, isCourseColor, isCourseId, isCourseTheme, parseChapters, slugify } from "./catalog";
import { sanitizeCourseHtml } from "./description";
import { normalizeChapters } from "./draft";
import { courseImageUrl, courseVideo } from "./media";
import { SEED_COURSES } from "./seed";
import type { Course, CourseChapter } from "./types";

function serviceClient() {
  return createServiceSupabase();
}

function databaseError(error: { code?: string; message: string }): string {
  if (error.code === "PGRST205" || /schema cache|does not exist/i.test(error.message)) {
    return "The courses table is not in the database yet. Apply the courses migration.";
  }
  if (error.code === "23505") {
    return "That address is already used by a course.";
  }
  return "The course could not be published.";
}

async function requirePublisher(): Promise<
  { ok: true; userId: string; superAdmin: boolean; admin: NonNullable<ReturnType<typeof serviceClient>> } | { ok: false; error: string }
> {
  const supabase = await createServerSupabase();
  if (!supabase) {
    return { ok: false, error: "Supabase is not configured." };
  }
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user?.email) {
    return { ok: false, error: "Sign in to publish a course." };
  }
  if (!(await userCanPublishCourses(supabase, user))) {
    return { ok: false, error: "This account cannot publish courses." };
  }
  const admin = serviceClient();
  if (!admin) {
    return { ok: false, error: "The server cannot publish courses yet." };
  }
  return { ok: true, userId: user.id, superAdmin: isCourseSuperAdmin(user), admin };
}

export async function currentUserCanPublish(): Promise<boolean> {
  const supabase = await createServerSupabase();
  if (!supabase) {
    return false;
  }
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return false;
  }
  return userCanPublishCourses(supabase, data.user);
}

function checkedCourse(input: Course): { course: Course; chapters: CourseChapter[] } | { error: string } {
  const title = input.title.trim();
  if (!title || title.length > 120) {
    return { error: "The course needs a title." };
  }
  if (!isCourseId(input.id)) {
    return { error: "The course id is not valid." };
  }
  if (!isCourseColor(input.color)) {
    return { error: "Choose white or black." };
  }
  if (!isCourseTheme(input.theme)) {
    return { error: "Choose a course theme." };
  }
  const summary = sanitizeCourseHtml(input.summary);
  if (summary.length > 8000) {
    return { error: "The description is too long." };
  }
  const coverInput = input.coverUrl?.trim() ?? "";
  const coverUrl = courseImageUrl(coverInput);
  if (coverInput && !coverUrl) {
    return { error: "The cover image needs an https link." };
  }
  const videoInput = input.videoUrl?.trim() ?? "";
  if (videoInput && !courseVideo(videoInput)) {
    return { error: "The video needs a YouTube, Vimeo, or https video file link." };
  }
  const slug = (input.slug.trim() || slugify(title)).slice(0, 60);
  const normalized = normalizeChapters(parseChapters(input.chapters as unknown as Json));
  if ("error" in normalized) {
    return normalized;
  }
  const chapters = normalized.chapters;
  return {
    course: {
      ...input,
      title,
      slug,
      summary,
      coverUrl: coverUrl ?? undefined,
      videoUrl: videoInput || undefined,
      chapters,
      builtin: false,
    },
    chapters,
  };
}

export async function publishCourse(input: Course): Promise<{ ok: true; course: Course } | { ok: false; error: string }> {
  const gate = await requirePublisher();
  if (!gate.ok) {
    return gate;
  }
  const checked = checkedCourse(input);
  if ("error" in checked) {
    return { ok: false, error: checked.error };
  }
  const { data: existing, error: listError } = await gate.admin.from("courses").select("id, slug");
  if (listError) {
    return { ok: false, error: databaseError(listError) };
  }
  const slugError = courseSlugError(checked.course.slug, [...SEED_COURSES, ...(existing ?? [])], checked.course.id);
  if (slugError) {
    return { ok: false, error: slugError };
  }
  const { data: existingRow, error: ownershipReadError } = await gate.admin
    .from("courses")
    .select("id, created_by")
    .eq("id", checked.course.id)
    .maybeSingle();
  if (ownershipReadError) {
    return { ok: false, error: databaseError(ownershipReadError) };
  }
  const ownership = courseOwnershipError(existingRow, gate.userId, gate.superAdmin);
  if (ownership) {
    return { ok: false, error: ownership };
  }
  // Point-read ownership keeps the race window minimal; the residual upsert
  // race is between trusted publishers (LOW, accepted).
  const { error } = await gate.admin.from("courses").upsert({
    id: checked.course.id,
    slug: checked.course.slug,
    title: checked.course.title,
    summary: checked.course.summary,
    cover_url: checked.course.coverUrl ?? null,
    video_url: checked.course.videoUrl ?? null,
    color: checked.course.color,
    theme: checked.course.theme,
    chapters: checked.chapters as unknown as Json,
    created_by: existingRow ? existingRow.created_by : gate.userId,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    return { ok: false, error: databaseError(error) };
  }
  return { ok: true, course: checked.course };
}

export async function removePublishedCourse(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isCourseId(id)) {
    return { ok: false, error: "The course id is not valid." };
  }
  const gate = await requirePublisher();
  if (!gate.ok) {
    return gate;
  }
  const { data: row, error: readError } = await gate.admin.from("courses").select("created_by").eq("id", id).maybeSingle();
  if (readError) {
    return { ok: false, error: databaseError(readError) };
  }
  const ownership = courseOwnershipError(row, gate.userId, gate.superAdmin);
  if (ownership) {
    return { ok: false, error: ownership };
  }
  if (gate.superAdmin) {
    const { error } = await gate.admin.from("courses").delete().eq("id", id);
    if (error) {
      return { ok: false, error: databaseError(error) };
    }
    return { ok: true };
  }
  const { data: deleted, error } = await gate.admin
    .from("courses")
    .delete()
    .eq("id", id)
    .eq("created_by", gate.userId)
    .select("id");
  if (error) {
    return { ok: false, error: databaseError(error) };
  }
  if (!deleted || deleted.length === 0) {
    return { ok: false, error: "The course changed ownership — refresh and try again." };
  }
  return { ok: true };
}
