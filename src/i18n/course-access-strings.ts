// SIG-1119: access-gated strings for the locked-lesson message.
// Strict EN + PT-BR tables via `createT` (same grain as
// src/i18n/course-strings.ts): a missing PT-BR key fails `tsc`.
import type { SiteLocale } from "./locale.ts";
import { createT } from "./create-t.ts";

export const COURSE_ACCESS_STRING_KEYS = [
  "course.access.unavailable",
] as const;

export type CourseAccessStringKey = (typeof COURSE_ACCESS_STRING_KEYS)[number];

const EN: Record<CourseAccessStringKey, string> = {
  "course.access.unavailable": "This lesson is not available.",
};

const PT_BR: Record<CourseAccessStringKey, string> = {
  "course.access.unavailable": "Esta lição não está disponível.",
};

export const COURSE_ACCESS_TABLES = { en: EN, "pt-br": PT_BR } as const;

export const tCourseAccess = createT(EN, PT_BR);

export type { SiteLocale };
