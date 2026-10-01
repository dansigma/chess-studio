import { createBrowserSupabase } from "@/src/lib/supabase/client";
import { isCourseColor, isCourseTheme, mergeCourseLists, parseChapters } from "./catalog";
import { courseImageUrl } from "./media";
import { mergeProgress } from "./progress";
import { SEED_COURSES } from "./seed";
import type { Course, VariationProgress } from "./types";

const LOCAL_COURSES_KEY = "xd-custom-courses";
const PROGRESS_KEY = "xd-course-progress";

export { courseSlugError, slugify } from "./catalog";

let progressCache: Record<string, VariationProgress> = {};
let accountUserId: string | null = null;
let progressOnAccount = false;

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") {
    return fallback;
  }
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocalProgress(progress: Record<string, VariationProgress>): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    // The account copy is the one that has to succeed.
  }
}

export function readLocalCustomCourses(): Course[] {
  const value = readJson<unknown>(LOCAL_COURSES_KEY, []);
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
    window.localStorage.removeItem(LOCAL_COURSES_KEY);
    return;
  }
  try {
    window.localStorage.setItem(LOCAL_COURSES_KEY, JSON.stringify(remaining));
  } catch {
    // Keep the draft in memory; a later import retries.
  }
}

export function clearLocalCustomCourses(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(LOCAL_COURSES_KEY);
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
  const local = readJson<Record<string, VariationProgress>>(PROGRESS_KEY, {});
  accountUserId = userId;
  progressOnAccount = false;
  if (!userId) {
    progressCache = local;
    return progressCache;
  }
  const supabase = createBrowserSupabase();
  if (!supabase) {
    progressCache = local;
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
  return progressCache;
}

export async function saveVariationProgress(variationId: string, progress: VariationProgress): Promise<string | null> {
  progressCache = { ...progressCache, [variationId]: progress };
  if (!accountUserId) {
    writeLocalProgress(progressCache);
    return null;
  }
  const supabase = createBrowserSupabase();
  if (!supabase) {
    writeLocalProgress(progressCache);
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
    writeLocalProgress(progressCache);
    return "Progress stayed in this browser.";
  }
  writeLocalProgress(progressCache);
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
