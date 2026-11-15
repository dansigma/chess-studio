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

/** Every field has a focus anchor with this id in every render mode (SIG-1363). */
export function focusTargetId(field: CourseField): string {
  return fieldDomId(field);
}

/**
 * A focusable region for a field with no input of its own (catalog fields
 * without inputs yet, the chapter list): it carries the field id and the error.
 */
export function FieldAnchor({ field, error, locale }: { field: CourseField; error: LocatedError | null; locale: AdminLocale }) {
  return (
    <div id={focusTargetId(field)} tabIndex={-1} className="outline-none">
      <FieldError field={field} error={error} locale={locale} />
    </div>
  );
}

/** Focuses a field's anchor (the rich-text editor for the summary); false when the node is not rendered. */
export function focusField(field: CourseField): boolean {
  const anchor = document.getElementById(focusTargetId(field));
  if (!anchor) {
    return false;
  }
  const inner = field === "summary" ? anchor.querySelector<HTMLElement>('[role="textbox"]') : null;
  const target = inner ?? anchor;
  target.focus();
  if (document.activeElement !== target) {
    // A disabled input (read-only mode) cannot take focus: use the error region.
    (document.getElementById(fieldErrorDomId(field)) ?? anchor).focus();
  }
  return true;
}
