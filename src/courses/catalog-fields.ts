import type { CourseAdminMessage } from "@/src/i18n/course-admin-strings";
import type { CourseLanguage, CourseLevel } from "./types";

/** SIG-1349: catalog fit fields (level, Elo range, language, duration). */
export const COURSE_LEVELS: readonly CourseLevel[] = ["beginner", "intermediate", "advanced"];
export const COURSE_LANGUAGES: readonly CourseLanguage[] = ["pt-br", "en"];
export const COURSE_ELO_MAX = 3500;
export const COURSE_DURATION_MAX = 20000;

export function isCourseLevel(value: unknown): value is CourseLevel {
  return typeof value === "string" && (COURSE_LEVELS as readonly string[]).includes(value);
}

export function isCourseLanguage(value: unknown): value is CourseLanguage {
  return typeof value === "string" && (COURSE_LANGUAGES as readonly string[]).includes(value);
}

/** Fail-open read: an unknown or absent level becomes beginner. */
export function readCourseLevel(value: unknown): CourseLevel {
  return isCourseLevel(value) ? value : "beginner";
}

/** Fail-open read: an unknown or absent language becomes pt-br. */
export function readCourseLanguage(value: unknown): CourseLanguage {
  return isCourseLanguage(value) ? value : "pt-br";
}

/** Fail-open read of a nullable integer column: anything else is null. */
export function readNullableInt(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

export type CatalogFieldsInput = {
  level: unknown;
  language: unknown;
  eloMin: unknown;
  eloMax: unknown;
  durationMinutes: unknown;
};

/** Strict write-side check, mirroring the database constraints. */
export function validateCatalogFields(input: CatalogFieldsInput): CourseAdminMessage | null {
  if (!isCourseLevel(input.level)) {
    return { key: "course.admin.error.invalidLevel" };
  }
  if (!isCourseLanguage(input.language)) {
    return { key: "course.admin.error.invalidLanguage" };
  }
  const min = input.eloMin ?? null;
  const max = input.eloMax ?? null;
  if ((min === null) !== (max === null)) {
    return { key: "course.admin.error.eloIncomplete" };
  }
  if (min !== null && max !== null) {
    const valid = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= COURSE_ELO_MAX;
    if (!valid(min) || !valid(max)) {
      return { key: "course.admin.error.eloOutOfRange" };
    }
    if (min > max) {
      return { key: "course.admin.error.eloOrder" };
    }
  }
  const duration = input.durationMinutes ?? null;
  if (duration !== null && !(typeof duration === "number" && Number.isInteger(duration) && duration >= 1 && duration <= COURSE_DURATION_MAX)) {
    return { key: "course.admin.error.invalidDuration" };
  }
  return null;
}

/** Defaults for a new course: beginner, pt-br, no Elo range, no duration. */
export const DEFAULT_CATALOG_FIELDS = {
  level: "beginner",
  eloMin: null,
  eloMax: null,
  language: "pt-br",
  durationMinutes: null,
} as const satisfies CatalogFieldsInput;
