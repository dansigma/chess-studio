// SIG-1119: access-gated strings for the locked-lesson call to action.
// Strict EN + PT-BR tables via `createT` (same grain as
// src/i18n/course-strings.ts): a missing PT-BR key fails `tsc`.
import type { SiteLocale } from "./locale.ts";
import { createT } from "./create-t.ts";

export const COURSE_ACCESS_STRING_KEYS = [
  "course.access.signInToStudy",
  "course.access.subscribeToStudy",
  "course.access.buyToStudy",
  "course.access.lockedPremium",
  "course.access.lockedPaid",
  "course.access.lockedSignIn",
] as const;

export type CourseAccessStringKey = (typeof COURSE_ACCESS_STRING_KEYS)[number];

const EN: Record<CourseAccessStringKey, string> = {
  "course.access.signInToStudy": "Sign in",
  "course.access.subscribeToStudy": "Subscribe",
  "course.access.buyToStudy": "Buy for {price}",
  "course.access.lockedPremium": "This line is for subscribers.",
  "course.access.lockedPaid": "This line is part of the paid course.",
  "course.access.lockedSignIn": "Sign in to study this line.",
};

const PT_BR: Record<CourseAccessStringKey, string> = {
  "course.access.signInToStudy": "Entrar",
  "course.access.subscribeToStudy": "Assinar",
  "course.access.buyToStudy": "Comprar por {price}",
  "course.access.lockedPremium": "Esta linha é para assinantes.",
  "course.access.lockedPaid": "Esta linha faz parte do curso pago.",
  "course.access.lockedSignIn": "Entre para estudar esta linha.",
};

export const COURSE_ACCESS_TABLES = { en: EN, "pt-br": PT_BR } as const;

export const tCourseAccess = createT(EN, PT_BR);

export type { SiteLocale };
