"use server";

import { revalidatePath } from "next/cache";
import { userCanPublishCourses } from "@/src/lib/auth/course-permissions";
import { canAuthorCourses, getRole, isAdmin, type Role } from "@/src/lib/auth/roles";
import type { Json } from "@/src/lib/supabase/database.types";
import { createServiceSupabase } from "@/src/lib/supabase/admin";
import { createServerSupabase } from "@/src/lib/supabase/server";
import type { CourseAdminErrorKey, CourseAdminMessage } from "@/src/i18n/course-admin-strings";
import { courseOwnershipError, courseSlugError, isCourseColor, isCourseId, isCourseTheme, parseChapters, slugify } from "./catalog";
import { sanitizeCourseHtml } from "./description";
import { hasPlayableContent, normalizeChapters } from "./draft";
import { courseCoverUrl, courseVideo } from "./media";
import { SEED_COURSES } from "./seed";
import { canTransition, type TransitionReason } from "./status";
import type { Course, CourseChapter, CourseStatus } from "./types";

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

/** Maps a canTransition denial to the failure literal the client renders. */
function transitionError(reason: TransitionReason): CourseAdminMessage {
  return { key: `course.admin.error.${reason}` };
}

type ServiceAdmin = NonNullable<ReturnType<typeof serviceClient>>;

type PublisherGate =
  | { ok: true; userId: string; role: Role; superAdmin: boolean; admin: ServiceAdmin }
  | { ok: false; error: CourseAdminMessage };

/** Row shape read before a status-changing write (ownership + transition + slug). */
type CourseStatusRow = {
  id: string;
  created_by: string | null;
  status?: string | null;
  slug?: string | null;
};

function rowStatus(row: CourseStatusRow | null | undefined): CourseStatus {
  const status = row?.status;
  return status === "draft" || status === "in_review" || status === "published" || status === "rejected" || status === "archived"
    ? status
    : "draft";
}

function rowOwner(row: CourseStatusRow | null | undefined, userId: string, superAdmin: boolean): boolean {
  if (superAdmin) return true;
  if (!row) return true;
  return row.created_by === userId;
}

/**
 * Revalidates the public surface after a write. Called exactly when a course
 * becomes or stops being public (status flip across the published boundary),
 * and unconditionally on archive/delete (acceptance: approve, unpublish,
 * archive or delete revalidate; a plain draft save does not).
 */
function revalidateCourse(slug: string, oldSlug?: string): void {
  revalidatePath("/courses");
  revalidatePath(`/courses/${slug}`, "layout");
  if (oldSlug && oldSlug !== slug) {
    revalidatePath(`/courses/${oldSlug}`, "layout");
  }
}

/** True when exactly one side of the transition is publicly visible. */
function visibilityChanged(from: CourseStatus, to: CourseStatus): boolean {
  return (from === "published") !== (to === "published");
}

async function requirePublisher(): Promise<PublisherGate> {
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
  return { ok: true, userId: user.id, role: "admin", superAdmin: isAdmin(role), admin };
}

/**
 * SIG-1113: coach-or-admin gate for draft work. Coaches pass here and are
 * then constrained per-course by canTransition; publish stays admin-only.
 */
async function requireAuthor(): Promise<PublisherGate> {
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
  if (!canAuthorCourses(role)) {
    return { ok: false, error: { key: "course.admin.error.cannotPublish" } };
  }
  const admin = serviceClient();
  if (!admin) {
    return { ok: false, error: { key: "course.admin.error.serverUnavailable" } };
  }
  return { ok: true, userId: user.id, role: role ?? "coach", superAdmin: isAdmin(role), admin };
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

export async function currentUserIsAdmin(): Promise<boolean> {
  const supabase = await createServerSupabase();
  if (!supabase) {
    return false;
  }
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return false;
  }
  return isAdmin(await getRole(supabase, data.user));
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

/** Reads the row a status-changing write needs (ownership + transition + slug). */
async function readCourseRow(
  admin: ServiceAdmin,
  id: string,
): Promise<{ row: CourseStatusRow | null } | { error: CourseAdminMessage }> {
  const { data, error } = await admin
    .from("courses")
    .select("id, created_by, status, slug")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    return { error: { key: databaseError(error) } };
  }
  return { row: (data ?? null) as CourseStatusRow | null };
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
  const read = await readCourseRow(gate.admin, checked.course.id);
  if ("error" in read) {
    return { ok: false, error: read.error };
  }
  const existingRow = read.row;
  const ownership = courseOwnershipError(existingRow, gate.userId, gate.superAdmin);
  if (ownership) {
    return { ok: false, error: ownership };
  }
  // SIG-1113: uniform matrix check — unreachable through the admin-only gate
  // for other roles, but every path to published is gated the same way.
  const from = rowStatus(existingRow);
  const transition = canTransition({
    role: gate.role,
    isOwner: rowOwner(existingRow, gate.userId, gate.superAdmin),
    from,
    to: "published",
  });
  if (!transition.ok) {
    return { ok: false, error: transitionError(transition.reason) };
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
  if (visibilityChanged(from, "published")) {
    revalidateCourse(checked.course.slug, existingRow?.slug ?? undefined);
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
  const read = await readCourseRow(gate.admin, id);
  if ("error" in read) {
    return { ok: false, error: read.error };
  }
  const ownership = courseOwnershipError(read.row, gate.userId, gate.superAdmin);
  if (ownership) {
    return { ok: false, error: ownership };
  }
  const from = rowStatus(read.row);
  const transition = canTransition({
    role: gate.role,
    isOwner: rowOwner(read.row, gate.userId, gate.superAdmin),
    from,
    to: "draft",
  });
  if (!transition.ok) {
    return { ok: false, error: transitionError(transition.reason) };
  }
  const { error } = await gate.admin
    .from("courses")
    .update({ status: "draft", published_at: null, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    return { ok: false, error: { key: databaseError(error) } };
  }
  if (visibilityChanged(from, "draft") && read.row?.slug) {
    revalidateCourse(read.row.slug);
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
  const read = await readCourseRow(gate.admin, id);
  if ("error" in read) {
    return { ok: false, error: read.error };
  }
  const ownership = courseOwnershipError(read.row, gate.userId, gate.superAdmin);
  if (ownership) {
    return { ok: false, error: ownership };
  }
  const slug = read.row?.slug ?? null;
  if (gate.superAdmin) {
    const { error } = await gate.admin.from("courses").delete().eq("id", id);
    if (error) {
      return { ok: false, error: { key: databaseError(error) } };
    }
    // Deletion always revalidates: a published course stops being public.
    if (slug) {
      revalidateCourse(slug);
    } else {
      revalidatePath("/courses");
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
  if (slug) {
    revalidateCourse(slug);
  } else {
    revalidatePath("/courses");
  }
  return { ok: true };
}

/**
 * SIG-1113: coach-or-admin draft save. Upserts the validated content with
 * status `draft`; a save on a `rejected` course returns it to `draft`.
 * The review note is never written here, so a rejected course keeps its
 * note for the resubmission context ("clears nothing else").
 */
export async function saveCourseDraft(input: Course): Promise<{ ok: true; course: Course } | { ok: false; error: CourseAdminMessage }> {
  const gate = await requireAuthor();
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
  const read = await readCourseRow(gate.admin, checked.course.id);
  if ("error" in read) {
    return { ok: false, error: read.error };
  }
  const existingRow = read.row;
  if (!gate.superAdmin && existingRow && existingRow.created_by !== gate.userId) {
    return { ok: false, error: { key: "course.admin.error.not_owner" } };
  }
  const from = rowStatus(existingRow);
  // A new course is born as a draft; an existing one must already be one.
  if (existingRow) {
    const transition = canTransition({
      role: gate.role,
      isOwner: rowOwner(existingRow, gate.userId, gate.superAdmin),
      from,
      to: "draft",
    });
    if (!transition.ok) {
      return { ok: false, error: transitionError(transition.reason) };
    }
  }
  const chaptersJson: Json = checked.chapters;
  const priceCents =
    typeof checked.course.priceCents === "number" && Number.isInteger(checked.course.priceCents) && checked.course.priceCents > 0
      ? checked.course.priceCents
      : null;
  const now = new Date().toISOString();
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
    updated_at: now,
    published_at: null,
    status: "draft",
    access_tier: checked.course.accessTier,
    price_cents: priceCents,
    author_display_name: checked.course.authorName?.trim() || null,
  });
  if (error) {
    return { ok: false, error: { key: databaseError(error) } };
  }
  // A plain draft save never changes public visibility: no revalidation.
  return { ok: true, course: { ...checked.course, status: "draft" as const, priceCents, publishedAt: null } };
}

/** SIG-1113: coach-or-admin submission for review (`draft|rejected → in_review`). */
export async function submitCourseForReview(id: string): Promise<{ ok: true } | { ok: false; error: CourseAdminMessage }> {
  if (!isCourseId(id)) {
    return { ok: false, error: { key: "course.admin.error.invalidId" } };
  }
  const gate = await requireAuthor();
  if (!gate.ok) {
    return gate;
  }
  const read = await readCourseRow(gate.admin, id);
  if ("error" in read) {
    return { ok: false, error: read.error };
  }
  if (!read.row) {
    return { ok: false, error: { key: "course.admin.error.publishFailed" } };
  }
  if (!gate.superAdmin && read.row.created_by !== gate.userId) {
    return { ok: false, error: { key: "course.admin.error.not_owner" } };
  }
  const from = rowStatus(read.row);
  const transition = canTransition({
    role: gate.role,
    isOwner: rowOwner(read.row, gate.userId, gate.superAdmin),
    from,
    to: "in_review",
  });
  if (!transition.ok) {
    return { ok: false, error: transitionError(transition.reason) };
  }
  const { error } = await gate.admin
    .from("courses")
    .update({ status: "in_review", updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    return { ok: false, error: { key: databaseError(error) } };
  }
  return { ok: true };
}

/** SIG-1113: admin approval — any status becomes `published`. */
export async function approveCourse(id: string): Promise<{ ok: true } | { ok: false; error: CourseAdminMessage }> {
  if (!isCourseId(id)) {
    return { ok: false, error: { key: "course.admin.error.invalidId" } };
  }
  const gate = await requirePublisher();
  if (!gate.ok) {
    return gate;
  }
  const read = await readCourseRow(gate.admin, id);
  if ("error" in read) {
    return { ok: false, error: read.error };
  }
  if (!read.row) {
    return { ok: false, error: { key: "course.admin.error.publishFailed" } };
  }
  const from = rowStatus(read.row);
  const transition = canTransition({
    role: gate.role,
    isOwner: rowOwner(read.row, gate.userId, gate.superAdmin),
    from,
    to: "published",
  });
  if (!transition.ok) {
    return { ok: false, error: transitionError(transition.reason) };
  }
  const now = new Date().toISOString();
  const { error } = await gate.admin
    .from("courses")
    .update({ status: "published", published_at: now, review_note: null, updated_at: now })
    .eq("id", id);
  if (error) {
    return { ok: false, error: { key: databaseError(error) } };
  }
  if (visibilityChanged(from, "published") && read.row.slug) {
    revalidateCourse(read.row.slug);
  }
  return { ok: true };
}

/**
 * SIG-1113: admin rejection — sets `rejected` with a 3–500 character note.
 * Revalidates exactly when the course was public.
 */
export async function rejectCourse(id: string, note: string): Promise<{ ok: true } | { ok: false; error: CourseAdminMessage }> {
  if (!isCourseId(id)) {
    return { ok: false, error: { key: "course.admin.error.invalidId" } };
  }
  const trimmed = note.trim();
  if (trimmed.length < 3 || trimmed.length > 500) {
    return { ok: false, error: { key: "course.admin.error.note_required" } };
  }
  const gate = await requirePublisher();
  if (!gate.ok) {
    return gate;
  }
  const read = await readCourseRow(gate.admin, id);
  if ("error" in read) {
    return { ok: false, error: read.error };
  }
  if (!read.row) {
    return { ok: false, error: { key: "course.admin.error.publishFailed" } };
  }
  const from = rowStatus(read.row);
  const transition = canTransition({
    role: gate.role,
    isOwner: rowOwner(read.row, gate.userId, gate.superAdmin),
    from,
    to: "rejected",
    hasNote: true,
  });
  if (!transition.ok) {
    return { ok: false, error: transitionError(transition.reason) };
  }
  const { error } = await gate.admin
    .from("courses")
    .update({ status: "rejected", review_note: trimmed, published_at: null, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    return { ok: false, error: { key: databaseError(error) } };
  }
  if (visibilityChanged(from, "rejected") && read.row.slug) {
    revalidateCourse(read.row.slug);
  }
  return { ok: true };
}

/** SIG-1113: admin archival — leaves `published` visibility, always revalidates. */
export async function archiveCourse(id: string): Promise<{ ok: true } | { ok: false; error: CourseAdminMessage }> {
  if (!isCourseId(id)) {
    return { ok: false, error: { key: "course.admin.error.invalidId" } };
  }
  const gate = await requirePublisher();
  if (!gate.ok) {
    return gate;
  }
  const read = await readCourseRow(gate.admin, id);
  if ("error" in read) {
    return { ok: false, error: read.error };
  }
  if (!read.row) {
    return { ok: false, error: { key: "course.admin.error.publishFailed" } };
  }
  const from = rowStatus(read.row);
  const transition = canTransition({
    role: gate.role,
    isOwner: rowOwner(read.row, gate.userId, gate.superAdmin),
    from,
    to: "archived",
  });
  if (!transition.ok) {
    return { ok: false, error: transitionError(transition.reason) };
  }
  const { error } = await gate.admin
    .from("courses")
    .update({ status: "archived", published_at: null, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    return { ok: false, error: { key: databaseError(error) } };
  }
  if (read.row.slug) {
    revalidateCourse(read.row.slug);
  } else {
    revalidatePath("/courses");
  }
  return { ok: true };
}
