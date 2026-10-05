import { createBrowserSupabase } from "@/src/lib/supabase/client";
import {
  COURSE_PROGRESS_KEY,
  CUSTOM_COURSES_KEY,
  isCourseProgressOwnedBy,
  readJsonCache,
  removeRawCache,
  writeCourseProgressOwner,
  writeRawCache,
} from "../lib/local-cache";
import { isCourseColor, isCourseTheme, mergeCourseLists, parseChapters } from "./catalog";
import { courseImageUrl } from "./media";
import { mergeProgress } from "./progress";
import { SEED_COURSES } from "./seed";
import type { Course, VariationProgress } from "./types";

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
  return value.filter((item): item is Course => typeof item === "object" && item !== null);
}

export function removeLocalCustomDraft(id: string): void {
  if (typeof window === "undefined") {
    return;
  }
  const remaining = readLocalCustomCourses().filter((course) => course.id !== id);
  if (remaining.length === 0) {
    removeRawCache(CUSTOM_COURSES_KEY);
    return;
  }
  try {
    writeRawCache(CUSTOM_COURSES_KEY, JSON.stringify(remaining));
  } catch {
    // Keep the draft in memory; a later import retries.
  }
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
  const { data, error } = await supabase
    .from("courses")
    .select("id, slug, title, summary, color, theme, chapters, cover_url, video_url")
    .order("updated_at", { ascending: false });
  if (error) {
    const missing = error.code === "PGRST205" || /schema cache|does not exist/i.test(error.message);
    return {
      courses: [],
      error: missing ? "Published courses are not available yet." : "Published courses could not be loaded.",
    };
  }
  const courses: Course[] = [];
  for (const row of data ?? []) {
    if (!isCourseColor(row.color) || !isCourseTheme(row.theme)) {
      continue;
    }
    courses.push({
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
  return { courses, error: null };
}

export async function fetchCourses(): Promise<{ courses: Course[]; error: string | null }> {
  const published = await fetchPublishedCourses();
  return { courses: mergeCourseLists(published.courses, SEED_COURSES), error: published.error };
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

export async function saveVariationProgress(variationId: string, progress: VariationProgress): Promise<string | null> {
  progressCache = { ...progressCache, [variationId]: progress };
  if (!accountUserId) {
    persistLocalProgress();
    return null;
  }
  const supabase = createBrowserSupabase();
  if (!supabase) {
    persistLocalProgress();
    return "Progress stayed in this browser.";
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
    return "Progress stayed in this browser.";
  }
  persistLocalProgress();
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
