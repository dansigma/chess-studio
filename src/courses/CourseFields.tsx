"use client";

import type { Dispatch, SetStateAction } from "react";
import dynamic from "next/dynamic";
import { tCourseAdmin } from "@/src/i18n/course-admin-strings";
import { courseThemeLabel, isCourseColor, isCourseTheme, slugify } from "./catalog";
import type { CourseDraft } from "./admin-draft";
import { useStudioStore } from "@/src/store/studio-store";
import { COURSE_THEMES } from "./types";

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

/** The course metadata fields above the chapter list (address through pieces). */
export function CourseFields({
  draft,
  setDraft,
}: {
  draft: CourseDraft;
  setDraft: Dispatch<SetStateAction<CourseDraft>>;
}) {
  const locale = useStudioStore((state) => state.settings.locale);
  return (
    <>
      <h1 className="text-xl font-semibold text-studio-fg">
        {draft.title.trim() || tCourseAdmin(locale, "course.admin.createHeading")}
      </h1>
      <p className="text-caption text-studio-muted">/courses/{draft.slug.trim() || slugify(draft.title) || "…"}</p>
      <label className="block text-caption text-studio-muted">
        {tCourseAdmin(locale, "course.admin.field.address")}
        <input
          value={draft.slug}
          onChange={(event) => setDraft({ ...draft, slug: event.target.value })}
          placeholder={slugify(draft.title) || "my-course"}
          className="mt-1 w-full rounded-lg border border-studio-border bg-studio-chrome px-3 py-2 text-body text-studio-fg"
        />
      </label>
      <label className="block text-caption text-studio-muted">
        {tCourseAdmin(locale, "course.admin.field.title")}
        <input
          value={draft.title}
          onChange={(event) => setDraft({ ...draft, title: event.target.value })}
          className="mt-1 w-full rounded-lg border border-studio-border bg-studio-chrome px-3 py-2 text-body text-studio-fg"
        />
      </label>
      <div className="block text-caption text-studio-muted">
        {tCourseAdmin(locale, "course.admin.field.description")}
        <DescriptionField
          key={`${draft.id}-${locale}`}
          value={draft.summary}
          onChange={(summary) => setDraft((current) => ({ ...current, summary }))}
        />
      </div>
      <label className="block text-caption text-studio-muted">
        {tCourseAdmin(locale, "course.admin.field.cover")}
        <input
          value={draft.coverUrl ?? ""}
          onChange={(event) => setDraft({ ...draft, coverUrl: event.target.value })}
          placeholder="https://"
          className="mt-1 w-full rounded-lg border border-studio-border bg-studio-chrome px-3 py-2 text-body text-studio-fg"
        />
      </label>
      <label className="block text-caption text-studio-muted">
        {tCourseAdmin(locale, "course.admin.field.video")}
        <input
          value={draft.videoUrl ?? ""}
          onChange={(event) => setDraft({ ...draft, videoUrl: event.target.value })}
          placeholder={tCourseAdmin(locale, "course.admin.field.videoPlaceholder")}
          className="mt-1 w-full rounded-lg border border-studio-border bg-studio-chrome px-3 py-2 text-body text-studio-fg"
        />
      </label>
      <label className="block text-caption text-studio-muted">
        {tCourseAdmin(locale, "course.admin.field.theme")}
        <select
          value={draft.theme}
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
      </label>
      <label className="block text-caption text-studio-muted">
        {tCourseAdmin(locale, "course.admin.field.pieces")}
        <select
          value={draft.color}
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
      </label>
    </>
  );
}
