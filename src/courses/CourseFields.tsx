"use client";

import type { Dispatch, SetStateAction } from "react";
import dynamic from "next/dynamic";
import { tCourseAdmin } from "@/src/i18n/course-admin-strings";
import { courseThemeLabel, isCourseColor, isCourseTheme, slugify } from "./catalog";
import type { CourseDraft } from "./admin-draft";
import { FieldAnchor, FieldError, fieldControlProps, fieldDomId } from "./FieldError";
import type { LocatedError } from "./validate-draft";
import { useStudioStore } from "@/src/store/studio-store";
import { COURSE_THEMES } from "./types";
import { CourseSummary } from "./CourseSummary";

const DescriptionField = dynamic(() => import("./DescriptionField").then((m) => m.DescriptionField), {
  ssr: false,
  loading: () => <DescriptionFieldPlaceholder />,
});

function DescriptionFieldPlaceholder() {
  const locale = useStudioStore((state) => state.settings.locale);
  return (
    <div className="mt-1 min-h-36 rounded-lg border border-studio-border bg-studio-chrome px-3 py-2 text-body text-studio-faint">
      {tCourseAdmin(locale, "course.admin.description.loading")}
    </div>
  );
}

type FieldsProps = {
  draft: CourseDraft;
  setDraft: Dispatch<SetStateAction<CourseDraft>>;
  /** SIG-1114: `in_review` renders every input disabled. */
  readOnly?: boolean;
  /** SIG-1363: the error to show next to its field, when it belongs to this group. */
  error: LocatedError | null;
};

/** Informações tab: address, title, theme, pieces and author. */
export function CourseInfoFields({ draft, setDraft, readOnly = false, error }: FieldsProps) {
  const locale = useStudioStore((state) => state.settings.locale);
  return (
    <>
      <label className="block text-caption text-studio-muted">
        {tCourseAdmin(locale, "course.admin.field.title")}
        <input
          {...fieldControlProps("title", error)}
          value={draft.title}
          disabled={readOnly}
          onChange={(event) => setDraft({ ...draft, title: event.target.value })}
          className="mt-1 w-full rounded-lg border border-studio-border bg-studio-chrome px-3 py-2 text-body text-studio-fg"
        />
        <FieldError field="title" error={error} locale={locale} />
      </label>
      <label className="block text-caption text-studio-muted">
        {tCourseAdmin(locale, "course.admin.field.address")}
        <input
          {...fieldControlProps("slug", error)}
          value={draft.slug}
          disabled={readOnly}
          onChange={(event) => setDraft({ ...draft, slug: event.target.value })}
          placeholder={slugify(draft.title) || "my-course"}
          className="mt-1 w-full rounded-lg border border-studio-border bg-studio-chrome px-3 py-2 text-body text-studio-fg"
        />
        <FieldError field="slug" error={error} locale={locale} />
      </label>
      <label className="block text-caption text-studio-muted">
        {tCourseAdmin(locale, "course.admin.field.theme")}
        <select
          {...fieldControlProps("theme", error)}
          value={draft.theme}
          disabled={readOnly}
          onChange={(event) => {
            const theme = event.target.value;
            if (theme === "" || isCourseTheme(theme)) {
              setDraft({ ...draft, theme });
            }
          }}
          className="mt-1 rounded-lg border border-studio-border bg-studio-chrome px-3 py-2 text-body text-studio-fg"
        >
          <option value="">{tCourseAdmin(locale, "course.admin.field.themePlaceholder")}</option>
          {COURSE_THEMES.map((theme) => (
            <option key={theme.id} value={theme.id}>
              {courseThemeLabel(theme.id, locale)}
            </option>
          ))}
        </select>
        <FieldError field="theme" error={error} locale={locale} />
      </label>
      <label className="block text-caption text-studio-muted">
        {tCourseAdmin(locale, "course.admin.field.pieces")}
        <select
          {...fieldControlProps("color", error)}
          value={draft.color}
          disabled={readOnly}
          onChange={(event) => {
            const color = event.target.value;
            if (isCourseColor(color)) {
              setDraft({ ...draft, color });
            }
          }}
          className="mt-1 rounded-lg border border-studio-border bg-studio-chrome px-3 py-2 text-body text-studio-fg"
        >
          <option value="white">{tCourseAdmin(locale, "course.admin.field.colorWhite")}</option>
          <option value="black">{tCourseAdmin(locale, "course.admin.field.colorBlack")}</option>
        </select>
        <FieldError field="color" error={error} locale={locale} />
      </label>
      <label className="block text-caption text-studio-muted">
        {tCourseAdmin(locale, "course.admin.field.authorName")}
        <input
          {...fieldControlProps("authorName", error)}
          value={draft.authorName ?? ""}
          disabled={readOnly}
          maxLength={120}
          onChange={(event) => setDraft({ ...draft, authorName: event.target.value })}
          placeholder={tCourseAdmin(locale, "course.admin.field.authorNamePlaceholder")}
          className="mt-1 w-full rounded-lg border border-studio-border bg-studio-chrome px-3 py-2 text-body text-studio-fg"
        />
        <FieldError field="authorName" error={error} locale={locale} />
      </label>
      {/* Catalog fields have no inputs yet (later issues add them here); their errors still show on this tab. */}
      <FieldAnchor field="level" error={error} locale={locale} />
      <FieldAnchor field="language" error={error} locale={locale} />
      <FieldAnchor field="elo" error={error} locale={locale} />
      <FieldAnchor field="duration" error={error} locale={locale} />
    </>
  );
}

/** Descrição tab: the rich-text course description. */
export function CourseDescriptionField({ draft, setDraft, readOnly = false, error }: FieldsProps) {
  const locale = useStudioStore((state) => state.settings.locale);
  const invalid = error?.field === "summary";
  return (
    <div
      id={fieldDomId("summary")}
      tabIndex={-1}
      aria-invalid={invalid ? true : undefined}
      aria-describedby={invalid ? "course-field-summary-error" : undefined}
      className="block text-caption text-studio-muted outline-none"
    >
      {tCourseAdmin(locale, "course.admin.field.description")}
      {readOnly ? (
        <CourseSummary
          html={draft.summary}
          className="mt-1 min-h-36 rounded-lg border border-studio-border bg-studio-chrome px-3 py-2 text-body text-studio-fg"
        />
      ) : (
        <DescriptionField
          key={`${draft.id}-${locale}`}
          value={draft.summary}
          onChange={(summary) => setDraft((current) => ({ ...current, summary }))}
        />
      )}
      <FieldError field="summary" error={error} locale={locale} />
    </div>
  );
}

/** Mídia tab: cover image and intro video. */
export function CourseMediaFields({ draft, setDraft, readOnly = false, error }: FieldsProps) {
  const locale = useStudioStore((state) => state.settings.locale);
  return (
    <>
      <label className="block text-caption text-studio-muted">
        {tCourseAdmin(locale, "course.admin.field.cover")}
        <input
          {...fieldControlProps("coverUrl", error)}
          value={draft.coverUrl ?? ""}
          disabled={readOnly}
          onChange={(event) => setDraft({ ...draft, coverUrl: event.target.value })}
          placeholder="https://"
          className="mt-1 w-full rounded-lg border border-studio-border bg-studio-chrome px-3 py-2 text-body text-studio-fg"
        />
        <FieldError field="coverUrl" error={error} locale={locale} />
      </label>
      <label className="block text-caption text-studio-muted">
        {tCourseAdmin(locale, "course.admin.field.video")}
        <input
          {...fieldControlProps("videoUrl", error)}
          value={draft.videoUrl ?? ""}
          disabled={readOnly}
          onChange={(event) => setDraft({ ...draft, videoUrl: event.target.value })}
          placeholder={tCourseAdmin(locale, "course.admin.field.videoPlaceholder")}
          className="mt-1 w-full rounded-lg border border-studio-border bg-studio-chrome px-3 py-2 text-body text-studio-fg"
        />
        <FieldError field="videoUrl" error={error} locale={locale} />
      </label>
    </>
  );
}
