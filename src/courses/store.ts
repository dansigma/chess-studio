import { createBrowserSupabase } from "@/src/lib/supabase/client";
import {
  COURSE_PROGRESS_KEY,
  CUSTOM_COURSES_KEY,
  isCourseProgressOwnedBy,
  readJsonCache,
  readRawCache,
  removeRawCache,
  writeCourseProgressOwner,
  writeRawCache,
} from "../lib/local-cache";
import { COURSE_SELECT_FIELDS, MISSING_SCHEMA_NOTICE, isCourseAccessTier, isCourseColor, isCourseId, isCourseStatus, isCourseTheme, isMissingSchemaError, parseChapters, toCourse } from "./catalog";
import { recordCompletion, shouldRecordCompletion } from "./enrollment";
import { mergeProgress } from "./progress";
import type { Course, CourseChapter } from "./types";
import type { VariationProgress } from "./types";
import type { Role } from "@/src/lib/auth/roles";

export { courseSlugError, slugify } from "./catalog";

let progressCache: Record<string, VariationProgress> = {};
let accountUserId: string | null = null;
let progressOnAccount = false;

export function resetCourseProgressState(): void {
  progressCache = {};
  accountUserId = null;
  progressOnAccount = false;
}

function readJson<T>(key: string, fallback: T): T {
  return readJsonCache<T>(key, fallback);
}

function writeLocalProgress(progress: Record<string, VariationProgress>): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    writeRawCache(COURSE_PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    // The account copy is the one that has to succeed.
  }
}

export function readLocalCustomCourses(): Course[] {
  const value = readJson<unknown>(CUSTOM_COURSES_KEY, []);
  if (!Array.isArray(value)) {
    return [];
  }
  const courses: Course[] = [];
  for (const item of value) {
    const course = toLocalDraftCourse(item);
    if (course) {
      courses.push(course);
    }
  }
  return courses;
}

/**
 * SIG-893: field-level validation for browser-local drafts. Lenient where
 * `importLocalDraft`/`save` regenerate (slug/title/summary/chapters), strict
 * where no safe default is knowable at read time (id/theme/color).
 */
export function toLocalDraftCourse(value: unknown): Course | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const row = value as Record<string, unknown>;
  const id = row.id;
  if (typeof id !== "string" || !isCourseId(id)) {
    return null;
  }
  const theme = row.theme;
  if (typeof theme !== "string" || !isCourseTheme(theme)) {
    return null;
  }
  const color = row.color;
  if (typeof color !== "string" || !isCourseColor(color)) {
    return null;
  }
  const slug = typeof row.slug === "string" ? row.slug : "";
  const title = typeof row.title === "string" ? row.title : "";
  const summary = typeof row.summary === "string" ? row.summary : "";
  const chapters: CourseChapter[] = parseChapters(row.chapters);
  const course: Course = {
    id,
    slug,
    title,
    summary,
    theme,
    color,
    chapters,
    status: "draft",
    accessTier: "free",
    priceCents: null,
  };
  if (typeof row.coverUrl === "string") {
    course.coverUrl = row.coverUrl;
  }
  if (typeof row.videoUrl === "string") {
    course.videoUrl = row.videoUrl;
  }
  if (typeof row.builtin === "boolean") {
    course.builtin = row.builtin;
  }
  if (typeof row.publishedAt === "string" || row.publishedAt === null) {
    course.publishedAt = row.publishedAt;
  } else {
    // Browser-local drafts predate the SIG-861 published_at lifecycle and
    // carry no publishedAt key; `isPublishedCourse` treats undefined as
    // published (anon-invisible rows never reach this store), so default
    // an explicit null (= draft) to keep the admin copy honest.
    course.publishedAt = null;
  }
  // SIG-1050: rows predating the status/tier columns carry none of these
  // keys; default them (draft/free) and validate present values.
  course.status = typeof row.status === "string" && isCourseStatus(row.status) ? row.status : "draft";
  course.accessTier = typeof row.accessTier === "string" && isCourseAccessTier(row.accessTier) ? row.accessTier : "free";
  course.priceCents = typeof row.priceCents === "number" && Number.isInteger(row.priceCents) && row.priceCents > 0 ? row.priceCents : null;
  if (typeof row.authorName === "string") {
    course.authorName = row.authorName;
  }
  if (typeof row.reviewNote === "string" || row.reviewNote === null) {
    course.reviewNote = row.reviewNote;
  }
  return course;
}

export function removeLocalCustomDraft(id: string): boolean {
  if (typeof window === "undefined") {
    return true;
  }
  const remaining = readLocalCustomCourses().filter((course) => course.id !== id);
  if (remaining.length === 0) {
    removeRawCache(CUSTOM_COURSES_KEY);
    return readRawCache(CUSTOM_COURSES_KEY) === null;
  }
  try {
    writeRawCache(CUSTOM_COURSES_KEY, JSON.stringify(remaining));
  } catch {
    return false;
  }
  // writeRawCache swallows storage errors by design, so verify by reading
  // back rather than trusting the call.
  const stored = readLocalCustomCourses();
  return stored.length === remaining.length && stored.every((course) => course.id !== id);
}

export function clearLocalCustomCourses(): void {
  if (typeof window === "undefined") {
    return;
  }
  removeRawCache(CUSTOM_COURSES_KEY);
}

export function progressSource(): "account" | "browser" {
  return progressOnAccount ? "account" : "browser";
}

export function loadProgress(): Record<string, VariationProgress> {
  return progressCache;
}

export async function fetchPublishedCourses(): Promise<{ courses: Course[]; error: string | null }> {
  const supabase = createBrowserSupabase();
  if (!supabase) {
    return { courses: [], error: null };
  }
  // SIG-861: no published_at filter here. RLS scopes visibility:
  // anon sees published_at-not-null rows only, while an authenticated
  // publisher also sees their own drafts via courses_select_own_drafts.
  // The admin list needs both so an unpublished course stays editable.
  const { data, error } = await supabase
    .from("courses")
    .select(COURSE_SELECT_FIELDS)
    .order("updated_at", { ascending: false });
  if (error) {
    const missing = isMissingSchemaError(error);
    return {
      courses: [],
      error: missing ? MISSING_SCHEMA_NOTICE : "Published courses could not be loaded.",
    };
  }
  const courses: Course[] = [];
  for (const row of data ?? []) {
    const course = toCourse(row);
    if (course) {
      courses.push(course);
    }
  }
  return { courses, error: null };
}

/**
 * SIG-1114: author-scoped list for the coach authoring screen. Admin runs
 * the same unfiltered query as before; a coach adds an explicit
 * `created_by` filter on top of the RLS own-drafts policy (defense in depth).
 * Everyone else gets an empty list (the page gate already blocks them).
 *
 * SIG-1119: editable chapters come from course_content (the gated table),
 * never from courses.chapters — the owner's rows pass their own read policy
 * through the user's session. When course_content has no row (fresh schema
 * without the gate migration), fall back to the outline so editing still
 * opens with chapter titles.
 */
export async function fetchAuthorCourses(input: {
  userId: string | null;
  role: Role | null;
}): Promise<{ courses: Course[]; error: string | null }> {
  const supabase = createBrowserSupabase();
  if (!supabase) {
    return { courses: [], error: null };
  }
  if (input.role !== "admin" && input.role !== "coach") {
    return { courses: [], error: null };
  }
  const query = supabase.from("courses").select(COURSE_SELECT_FIELDS).order("updated_at", { ascending: false });
  if (input.role === "admin") {
    const { data, error } = await query;
    if (error) {
      const missing = isMissingSchemaError(error);
      return {
        courses: [],
        error: missing ? MISSING_SCHEMA_NOTICE : "Published courses could not be loaded.",
      };
    }
    const courses: Course[] = [];
    for (const row of data ?? []) {
      const course = withEditableChapters(await attachEditableChapters(supabase, toCourse(row)));
      if (course) {
        courses.push(course);
      }
    }
    return { courses, error: null };
  }
  // Coach: own courses only. RLS already scopes to own drafts + published,
  // the explicit created_by filter is defense in depth.
  if (!input.userId) {
    return { courses: [], error: null };
  }
  const { data, error } = await query.eq("created_by", input.userId);
  if (error) {
    const missing = isMissingSchemaError(error);
    return {
      courses: [],
      error: missing ? MISSING_SCHEMA_NOTICE : "Published courses could not be loaded.",
    };
  }
  const courses: Course[] = [];
  for (const row of data ?? []) {
    const course = withEditableChapters(await attachEditableChapters(supabase, toCourse(row)));
    if (course) {
      courses.push(course);
    }
  }
  return { courses, error: null };
}

/** Editable course from the gated content row: full chapters, contentLoaded. */
type EditableContentRow = { chapters?: unknown };

async function attachEditableChapters(
  supabase: NonNullable<ReturnType<typeof createBrowserSupabase>>,
  course: Course | null,
): Promise<EditableContentRow & { course: Course | null }> {
  if (!course || course.builtin) {
    return { course };
  }
  // The browser client cannot generically express new tables: course_content
  // landed with the gate migration and may be absent from generated types.
  const { data, error } = await (supabase as unknown as {
    from: (table: string) => {
      select: (cols: string) => { eq: (col: string, v: string) => { maybeSingle: () => Promise<{ data: unknown; error: unknown }> } };
    };
  })
    .from("course_content")
    .select("chapters")
    .eq("course_id", course.id)
    .maybeSingle();
  if (error || !data || typeof data !== "object" || !("chapters" in data)) {
    // No gated row (own draft created before the backfill, or the gate
    // migration not applied yet): keep the outline chapters.
    return { course };
  }
  return { course, chapters: (data as { chapters: unknown }).chapters };
}

function withEditableChapters(attached: { course: Course | null; chapters?: unknown }): Course | null {
  const { course, chapters } = attached;
  if (!course) {
    return null;
  }
  if (chapters === undefined) {
    return course;
  }
  return { ...course, chapters: parseChapters(chapters), contentLoaded: true };
}

/** Parse the gated course_content row for one course (lesson content). */
export function parseContentChapters(value: unknown): CourseChapter[] {
  return parseChapters(value);
}

export async function hydrateProgress(userId: string | null): Promise<Record<string, VariationProgress>> {
  const stored = readJson<Record<string, VariationProgress>>(COURSE_PROGRESS_KEY, {});
  // SIG-886: a hydrate racing ahead of the account-change purge must not
  // merge another user's local rows into this account. Unmarked data is
  // the anonymous trial (or legacy) and stays mergeable; marked foreign
  // data is dropped on sight so no later hydrate can adopt it.
  const owned = isCourseProgressOwnedBy(userId);
  const local = owned ? stored : {};
  accountUserId = userId;
  progressOnAccount = false;
  if (!owned) {
    removeRawCache(COURSE_PROGRESS_KEY);
    writeCourseProgressOwner(null);
  }
  if (!userId) {
    progressCache = local;
    return progressCache;
  }
  const supabase = createBrowserSupabase();
  if (!supabase) {
    progressCache = local;
    if (owned) {
      writeCourseProgressOwner(userId);
    }
    return progressCache;
  }
  const { data, error } = await supabase
    .from("course_progress")
    .select("variation_id, step, learned")
    .eq("user_id", userId);
  if (error) {
    progressCache = local;
    return progressCache;
  }
  const remote: Record<string, VariationProgress> = {};
  for (const row of data ?? []) {
    remote[row.variation_id] = { step: row.step, learned: row.learned };
  }
  const { merged, toUpload } = mergeProgress(local, remote);
  const ids = Object.keys(toUpload);
  let uploadFailed = false;
  if (ids.length > 0) {
    const { error: uploadError } = await supabase.from("course_progress").upsert(
      ids.map((variationId) => ({
        user_id: userId,
        variation_id: variationId,
        step: toUpload[variationId].step,
        learned: toUpload[variationId].learned,
        updated_at: new Date().toISOString(),
      })),
    );
    uploadFailed = Boolean(uploadError);
  }
  progressCache = merged;
  progressOnAccount = !uploadFailed;
  writeLocalProgress(merged);
  writeCourseProgressOwner(userId);
  return progressCache;
}

function persistLocalProgress(): void {
  writeLocalProgress(progressCache);
  writeCourseProgressOwner(accountUserId);
}

/**
 * Stable fallback code (never English): the caller maps it through
 * `course.lesson.browserOnlyFallback`. A display string here would bypass the
 * locale tables — LessonView renders this return value as the lesson notice.
 */
export const PROGRESS_BROWSER_ONLY = "browser-only" as const;

export async function saveVariationProgress(
  variationId: string,
  progress: VariationProgress,
  course?: Course,
): Promise<string | null> {
  progressCache = { ...progressCache, [variationId]: progress };
  if (!accountUserId) {
    persistLocalProgress();
    return null;
  }
  const supabase = createBrowserSupabase();
  if (!supabase) {
    persistLocalProgress();
    return PROGRESS_BROWSER_ONLY;
  }
  const { error } = await supabase.from("course_progress").upsert({
    user_id: accountUserId,
    variation_id: variationId,
    step: progress.step,
    learned: progress.learned,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    persistLocalProgress();
    return PROGRESS_BROWSER_ONLY;
  }
  persistLocalProgress();
  // SIG-1052: the save succeeded and the caller knows the course the
  // variation belongs to (variation_id has no course link in SQL). When the
  // merged progress reaches 100%, stamp completed_at once — fire-and-forget
  // so lesson-step latency is unchanged. Seed/builtin courses never write.
  if (course && !course.builtin && shouldRecordCompletion(coursePercent(course, progressCache), false)) {
    void recordCompletion(supabase, accountUserId, course.id);
  }
  return null;
}

export function findVariation(course: Course, variationId: string) {
  for (const chapter of course.chapters) {
    const variation = chapter.variations.find((item) => item.id === variationId);
    if (variation) {
      return { chapter, variation };
    }
  }
  return null;
}

export function courseVariationIds(course: Course): string[] {
  return course.chapters.flatMap((chapter) => chapter.variations.map((variation) => variation.id));
}

export function coursePercent(course: Course, progress = progressCache): number {
  const ids = courseVariationIds(course);
  if (ids.length === 0) {
    return 0;
  }
  const learned = ids.filter((id) => progress[id]?.learned).length;
  return Math.round((learned / ids.length) * 100);
}
