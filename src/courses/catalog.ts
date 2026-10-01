import type { Json } from "@/src/lib/supabase/database.types";
import { COURSE_THEMES, type Course, type CourseChapter, type CourseColor, type CourseTheme, type CourseVariation } from "./types";

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

export function findPublishedConflict(
  id: string,
  courses: Pick<Course, "id" | "title">[],
): Pick<Course, "id" | "title"> | null {
  if (!isCourseId(id)) {
    return null;
  }
  return courses.find((course) => course.id === id) ?? null;
}

export function parseChapters(value: Json): CourseChapter[] {
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
