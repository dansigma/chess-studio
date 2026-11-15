"use client";

import { useEffect, useState } from "react";
import { tCourseAdmin } from "@/src/i18n/course-admin-strings";
import { useStudioStore } from "@/src/store/studio-store";
import { Button } from "@/src/studio/ui/Button";
import { FieldError, fieldControlProps, fieldErrorDomId } from "../FieldError";
import { validateMediaLink, type MediaLinkKind } from "../media-link";
import type { CourseField, LocatedError } from "../validate-draft";
import { VideoEmbed } from "./VideoEmbed";

const DEBOUNCE_MS = 300;

/** A link input with live validation and a preview of what the student will see. */
export function MediaLinkField({
  kind,
  field,
  label,
  value,
  onChange,
  placeholder,
  disabled = false,
  error,
  onRemove,
  debounceMs = DEBOUNCE_MS,
}: {
  kind: MediaLinkKind;
  field: CourseField;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** The save-time error, shown for this field when it points here. */
  error: LocatedError | null;
  /** Shows a Remover button (when there is a value) that clears the link. */
  onRemove?: () => void;
  debounceMs?: number;
}) {
  const locale = useStudioStore((state) => state.settings.locale);
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), debounceMs);
    return () => clearTimeout(timer);
  }, [value, debounceMs]);

  const result = validateMediaLink(kind, debounceMs <= 0 ? value : settled);
  const savedError = error?.field === field;
  const liveError = !savedError && result.state === "invalid" ? result.errorKey : null;
  const control = fieldControlProps(field, error);
  const hasValue = value.trim().length > 0;
  return (
    <div className="block text-caption text-studio-muted">
      <label>
        {label}
        <input
          {...control}
          aria-invalid={control["aria-invalid"] ?? (liveError ? true : undefined)}
          aria-describedby={control["aria-describedby"] ?? (liveError ? fieldErrorDomId(field) : undefined)}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="mt-1 w-full rounded-lg border border-studio-border bg-studio-chrome px-3 py-2 text-body text-studio-fg"
        />
      </label>
      <FieldError field={field} error={error} locale={locale} />
      {liveError ? (
        <p id={fieldErrorDomId(field)} role="alert" className="mt-1 text-caption text-studio-warning-fg">
          {tCourseAdmin(locale, liveError)}
        </p>
      ) : null}
      {result.state === "valid" && result.kind === "cover" ? (
        // eslint-disable-next-line @next/next/no-img-element -- author-supplied https cover, same as the catalog card
        <img
          src={result.url}
          alt={tCourseAdmin(locale, "course.admin.media.coverPreview")}
          className="mt-2 aspect-video w-full max-w-md rounded-xl border border-studio-border object-cover"
        />
      ) : null}
      {result.state === "valid" && result.kind === "video" ? <VideoEmbed url={result.url} title={label} /> : null}
      {onRemove && hasValue && !disabled ? (
        <div className="mt-2">
          <Button variant="ghost" onClick={onRemove}>
            {tCourseAdmin(locale, "course.admin.media.remove")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
