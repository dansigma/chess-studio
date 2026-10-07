import type { Json } from "@/src/lib/supabase/database.types";
import { courseImageUrl } from "./media";
import { COURSE_THEMES, type CatalogCourse, type Course, type CourseChapter, type CourseColor, type CourseTheme, type CourseVariation, type VariationProgress } from "./types";

export function slugify(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

export function mergeCourseLists(published: Course[], seed: Course[]): Course[] {
  const slugs = new Set(published.map((course) => course.slug));
  return [...published, ...seed.filter((course) => !slugs.has(course.slug))];
}

/**
 * Chapters-free catalog card for one course. Empty chapters (no lines) are
 * dropped, matching the catalog rendering.
 */
export function toCatalogCourse(course: Course): CatalogCourse {
  const chapters = course.chapters.filter((chapter) => chapter.variations.length > 0);
  const variationIds = chapters.flatMap((chapter) => chapter.variations.map((variation) => variation.id));
  return {
    id: course.id,
    slug: course.slug,
    title: course.title,
    summary: course.summary,
    coverUrl: course.coverUrl,
    videoUrl: course.videoUrl,
    theme: course.theme,
    color: course.color,
    chapterCount: chapters.length,
    moveCount: variationIds.length,
    variationIds,
  };
}

export function toCatalogCourses(courses: Course[]): CatalogCourse[] {
  return courses.map(toCatalogCourse);
}

/** Percent of learned lines, from the card's variation ids (no chapters needed). */
export function catalogCoursePercent(
  course: CatalogCourse,
  progress: Record<string, VariationProgress>,
): number {
  if (course.variationIds.length === 0) {
    return 0;
  }
  const learned = course.variationIds.filter((id) => progress[id]?.learned).length;
  return Math.round((learned / course.variationIds.length) * 100);
}

export function courseSlugError(
  slug: string,
  existing: { id: string; slug: string }[],
  exceptId?: string,
): string | null {
  if (!slug) {
    return "The course needs an address.";
  }
  if (existing.some((course) => course.slug === slug && course.id !== exceptId)) {
    return "That address is already used by a course.";
  }
  return null;
}

export type CourseOwnership = { created_by: string | null };

export function courseOwnershipError(
  existing: CourseOwnership | null | undefined,
  userId: string,
  superAdmin: boolean,
): string | null {
  if (!existing) return null;
  if (superAdmin) return null;
  if (existing.created_by === userId) return null;
  if (existing.created_by === null) return "This course has no owner — a course admin must reclaim it.";
  return "This course belongs to another publisher.";
}

export function findPublishedConflict(
  id: string,
  courses: Pick<Course, "id" | "title">[],
): Pick<Course, "id" | "title"> | null {
  if (!isCourseId(id)) {
    return null;
  }
  return courses.find((course) => course.id === id) ?? null;
}

export function parseChapters(value: unknown): CourseChapter[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const chapters: CourseChapter[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    const chapter = item as Record<string, Json | undefined>;
    if (typeof chapter.id !== "string" || typeof chapter.title !== "string" || !Array.isArray(chapter.variations)) {
      continue;
    }
    const variations: CourseVariation[] = [];
    for (const raw of chapter.variations) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        continue;
      }
      const variation = raw as Record<string, Json | undefined>;
      if (
        typeof variation.id !== "string" ||
        typeof variation.title !== "string" ||
        typeof variation.pgn !== "string"
      ) {
        continue;
      }
      variations.push({ id: variation.id, title: variation.title, pgn: variation.pgn });
    }
    chapters.push({ id: chapter.id, title: chapter.title, variations });
  }
  return chapters;
}

export function isCourseId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

export function isCourseColor(value: string): value is CourseColor {
  return value === "white" || value === "black";
}

export function isCourseTheme(value: string): value is CourseTheme {
  return COURSE_THEMES.some((theme) => theme.id === value);
}

export function courseThemeLabel(theme: CourseTheme): string {
  return COURSE_THEMES.find((item) => item.id === theme)?.label ?? "Openings";
}

/** Select list shared by the course server components (one canonical read). */
export const COURSE_SELECT_FIELDS =
  "id, slug, title, summary, color, theme, chapters, cover_url, video_url" as const;

export type CourseRow = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  cover_url: string | null;
  video_url: string | null;
  theme: string;
  color: string;
  chapters: Json;
};

/** Canonical DB-row → Course mapping for the course server components. */
export function toCourse(row: CourseRow): Course | null {
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

/** User-facing copy when the courses schema is missing (fresh project): the seed ships with this notice. */
export const MISSING_SCHEMA_NOTICE = "Published courses are not available yet.";

/** True for a missing-table/schema failure (fresh project, schema lag). */
export function isMissingSchemaError(error: { code?: string | null; message?: string } | null | undefined): boolean {
  if (!error) {
    return false;
  }
  return error.code === "PGRST205" || /schema cache|does not exist/i.test(error.message ?? "");
}
