"use server";

import { userCanPublishCourses } from "@/src/lib/auth/course-permissions";
import { canAuthorCourses, getRole, isAdmin } from "@/src/lib/auth/roles";
import type { Json } from "@/src/lib/supabase/database.types";
import { createServiceSupabase } from "@/src/lib/supabase/admin";
import { createServerSupabase } from "@/src/lib/supabase/server";
import type { CourseAdminErrorKey, CourseAdminMessage } from "@/src/i18n/course-admin-strings";
import { courseOwnershipError, courseSlugError, isCourseColor, isCourseId, isCourseTheme, parseChapters, slugify } from "./catalog";
import { sanitizeCourseHtml } from "./description";
import { hasPlayableContent, normalizeChapters } from "./draft";
import { courseCoverUrl, courseVideo } from "./media";
import { SEED_COURSES } from "./seed";
import type { Course, CourseChapter } from "./types";

function serviceClient() {
  return createServiceSupabase();
}

function databaseError(error: { code?: string; message: string }): CourseAdminErrorKey {
  if (error.code === "PGRST205" || /schema cache|does not exist/i.test(error.message)) {
    return "course.admin.error.tableMissing";
  }
  if (error.code === "23505") {
    return "course.admin.error.addressInUse";
  }
  return "course.admin.error.publishFailed";
}

async function requirePublisher(): Promise<
  { ok: true; userId: string; superAdmin: boolean; admin: NonNullable<ReturnType<typeof serviceClient>> } | { ok: false; error: CourseAdminMessage }
> {
  const supabase = await createServerSupabase();
  if (!supabase) {
    return { ok: false, error: { key: "course.admin.error.supabaseNotConfigured" } };
  }
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user?.email) {
    return { ok: false, error: { key: "course.admin.error.signinRequired" } };
  }
  const role = await getRole(supabase, user);
  if (!isAdmin(role)) {
    return { ok: false, error: { key: "course.admin.error.cannotPublish" } };
  }
  const admin = serviceClient();
  if (!admin) {
    return { ok: false, error: { key: "course.admin.error.serverUnavailable" } };
  }
  return { ok: true, userId: user.id, superAdmin: isAdmin(role), admin };
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

export async function currentUserCanAuthor(): Promise<boolean> {
  const supabase = await createServerSupabase();
  if (!supabase) {
    return false;
  }
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return false;
  }
  return canAuthorCourses(await getRole(supabase, data.user));
}

function checkedCourse(input: Course): { course: Course; chapters: CourseChapter[] } | { error: CourseAdminMessage } {
  const title = input.title.trim();
  if (!title || title.length > 120) {
    return { error: { key: "course.admin.error.needsTitle" } };
  }
  if (!isCourseId(input.id)) {
    return { error: { key: "course.admin.error.invalidId" } };
  }
  if (!isCourseColor(input.color)) {
    return { error: { key: "course.admin.error.chooseColor" } };
  }
  if (!isCourseTheme(input.theme)) {
    return { error: { key: "course.admin.error.chooseTheme" } };
  }
  const summary = sanitizeCourseHtml(input.summary);
  if (summary.length > 8000) {
    return { error: { key: "course.admin.error.descriptionTooLong" } };
  }
  const coverInput = input.coverUrl?.trim() ?? "";
  const coverUrl = courseCoverUrl(coverInput);
  if (coverInput && !coverUrl) {
    return { error: { key: "course.admin.error.coverHost" } };
  }
  const videoInput = input.videoUrl?.trim() ?? "";
  if (videoInput && !courseVideo(videoInput)) {
    return { error: { key: "course.admin.error.videoLink" } };
  }
  const slug = (slugify(input.slug.trim()) || slugify(title)).slice(0, 60);
  if (!slug) {
    return { error: { key: "course.admin.error.needsAddress" } };
  }
  const normalized = normalizeChapters(parseChapters(input.chapters));
  if ("error" in normalized) {
    return normalized;
  }
  const chapters = normalized.chapters;
  if (!hasPlayableContent(chapters)) {
    return { error: { key: "course.admin.error.needsPlayableLine" } };
  }
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

export async function publishCourse(input: Course): Promise<{ ok: true; course: Course } | { ok: false; error: CourseAdminMessage }> {
  const gate = await requirePublisher();
  if (!gate.ok) {
    return gate;
  }
  const checked = checkedCourse(input);
  if ("error" in checked) {
    return { ok: false, error: checked.error };
  }
  const seedCollision = courseSlugError(checked.course.slug, SEED_COURSES, checked.course.id);
  if (seedCollision) {
    return { ok: false, error: seedCollision };
  }
  // Point query by slug: the DB unique constraint on slug is the final race
  // arbiter (23505), this read is a fast pre-check, not a full-table scan.
  // The eq filter guarantees every row carries the queried slug, so a row
  // with a different id is a collision; our own id means re-publishing.
  const { data: slugRows, error: slugError } = await gate.admin
    .from("courses")
    .select("id")
    .eq("slug", checked.course.slug);
  if (slugError) {
    return { ok: false, error: { key: databaseError(slugError) } };
  }
  if ((slugRows ?? []).some((row) => row.id !== checked.course.id)) {
    return { ok: false, error: { key: "course.admin.error.addressInUse" } };
  }
  const { data: existingRow, error: ownershipReadError } = await gate.admin
    .from("courses")
    .select("id, created_by")
    .eq("id", checked.course.id)
    .maybeSingle();
  if (ownershipReadError) {
    return { ok: false, error: { key: databaseError(ownershipReadError) } };
  }
  const ownership = courseOwnershipError(existingRow, gate.userId, gate.superAdmin);
  if (ownership) {
    return { ok: false, error: ownership };
  }
  // chapters are normalizeChapters-validated above; CourseChapter is a
  // Json-compatible shape, so this needs no cast to reach the column type.
  const chaptersJson: Json = checked.chapters;
  // SIG-861: publishing means visible to anon — stamp published_at.
  // SIG-1050: status is the source of truth; write both (the trigger is a
  // backstop for out-of-band writes).
  // Point-read ownership keeps the race window minimal; the residual upsert
  // race is between trusted publishers (LOW, accepted).
  const publishedAt = new Date().toISOString();
  const { error } = await gate.admin.from("courses").upsert({
    id: checked.course.id,
    slug: checked.course.slug,
    title: checked.course.title,
    summary: checked.course.summary,
    cover_url: checked.course.coverUrl ?? null,
    video_url: checked.course.videoUrl ?? null,
    color: checked.course.color,
    theme: checked.course.theme,
    chapters: chaptersJson,
    created_by: existingRow ? existingRow.created_by : gate.userId,
    updated_at: publishedAt,
    published_at: publishedAt,
    status: "published",
  });
  if (error) {
    return { ok: false, error: { key: databaseError(error) } };
  }
  return { ok: true, course: { ...checked.course, status: "published" as const, publishedAt } };
}

export async function unpublishCourse(id: string): Promise<{ ok: true } | { ok: false; error: CourseAdminMessage }> {
  if (!isCourseId(id)) {
    return { ok: false, error: { key: "course.admin.error.invalidId" } };
  }
  const gate = await requirePublisher();
  if (!gate.ok) {
    return gate;
  }
  const { data: row, error: readError } = await gate.admin.from("courses").select("created_by").eq("id", id).maybeSingle();
  if (readError) {
    return { ok: false, error: { key: databaseError(readError) } };
  }
  const ownership = courseOwnershipError(row, gate.userId, gate.superAdmin);
  if (ownership) {
    return { ok: false, error: ownership };
  }
  const { error } = await gate.admin
    .from("courses")
    .update({ status: "draft", published_at: null, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    return { ok: false, error: { key: databaseError(error) } };
  }
  return { ok: true };
}

export async function removePublishedCourse(id: string): Promise<{ ok: true } | { ok: false; error: CourseAdminMessage }> {
  if (!isCourseId(id)) {
    return { ok: false, error: { key: "course.admin.error.invalidId" } };
  }
  const gate = await requirePublisher();
  if (!gate.ok) {
    return gate;
  }
  const { data: row, error: readError } = await gate.admin.from("courses").select("created_by").eq("id", id).maybeSingle();
  if (readError) {
    return { ok: false, error: { key: databaseError(readError) } };
  }
  const ownership = courseOwnershipError(row, gate.userId, gate.superAdmin);
  if (ownership) {
    return { ok: false, error: ownership };
  }
  if (gate.superAdmin) {
    const { error } = await gate.admin.from("courses").delete().eq("id", id);
    if (error) {
      return { ok: false, error: { key: databaseError(error) } };
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
    return { ok: false, error: { key: databaseError(error) } };
  }
  if (!deleted || deleted.length === 0) {
    return { ok: false, error: { key: "course.admin.error.ownershipChanged" } };
  }
  return { ok: true };
}
