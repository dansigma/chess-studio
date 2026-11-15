import { tCourseAdmin } from "@/src/i18n/course-admin-strings";
import type { CourseField, LocatedError } from "./validate-draft";

type AdminLocale = Parameters<typeof tCourseAdmin>[0];

/** DOM id of the input (or section) for a field. */
export function fieldDomId(field: CourseField): string {
  return `course-field-${field}`;
}

export function fieldErrorDomId(field: CourseField): string {
  return `course-field-${field}-error`;
}

/** `id`, `aria-invalid` and `aria-describedby` for a field's control. */
export function fieldControlProps(field: CourseField, error: LocatedError | null) {
  const invalid = error?.field === field;
  return {
    id: fieldDomId(field),
    "aria-invalid": invalid ? true : undefined,
    "aria-describedby": invalid ? fieldErrorDomId(field) : undefined,
  } as const;
}

/** The error message next to its field; renders nothing for other fields. */
export function FieldError({ field, error, locale }: { field: CourseField; error: LocatedError | null; locale: AdminLocale }) {
  if (error?.field !== field) {
    return null;
  }
  return (
    <p id={fieldErrorDomId(field)} role="alert" tabIndex={-1} className="mt-1 text-caption text-studio-warning-fg">
      {tCourseAdmin(locale, error.error.key, error.error.vars)}
    </p>
  );
}
