"use client";

import type { Dispatch, SetStateAction } from "react";
import { DescriptionField } from "./DescriptionField";
import { courseThemeLabel, isCourseColor, isCourseTheme, slugify } from "./catalog";
import type { CourseDraft } from "./admin-draft";
import { useStudioStore } from "@/src/store/studio-store";
import { COURSE_THEMES } from "./types";

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
      <h1 className="text-xl font-semibold text-studio-fg">{draft.title.trim() || "Create a course"}</h1>
      <p className="text-caption text-studio-muted">/courses/{draft.slug.trim() || slugify(draft.title) || "…"}</p>
      <label className="block text-caption text-studio-muted">
        Address
        <input
          value={draft.slug}
          onChange={(event) => setDraft({ ...draft, slug: event.target.value })}
          placeholder={slugify(draft.title) || "my-course"}
          className="mt-1 w-full rounded-lg border border-studio-border bg-studio-chrome px-3 py-2 text-body text-studio-fg"
        />
      </label>
      <label className="block text-caption text-studio-muted">
        Title
        <input
          value={draft.title}
          onChange={(event) => setDraft({ ...draft, title: event.target.value })}
          className="mt-1 w-full rounded-lg border border-studio-border bg-studio-chrome px-3 py-2 text-body text-studio-fg"
        />
      </label>
      <div className="block text-caption text-studio-muted">
        Course description
        <DescriptionField
          key={draft.id}
          value={draft.summary}
          onChange={(summary) => setDraft((current) => ({ ...current, summary }))}
        />
      </div>
      <label className="block text-caption text-studio-muted">
        Cover image
        <input
          value={draft.coverUrl ?? ""}
          onChange={(event) => setDraft({ ...draft, coverUrl: event.target.value })}
          placeholder="https://"
          className="mt-1 w-full rounded-lg border border-studio-border bg-studio-chrome px-3 py-2 text-body text-studio-fg"
        />
      </label>
      <label className="block text-caption text-studio-muted">
        Intro video
        <input
          value={draft.videoUrl ?? ""}
          onChange={(event) => setDraft({ ...draft, videoUrl: event.target.value })}
          placeholder="YouTube, Vimeo, or an https video file"
          className="mt-1 w-full rounded-lg border border-studio-border bg-studio-chrome px-3 py-2 text-body text-studio-fg"
        />
      </label>
      <label className="block text-caption text-studio-muted">
        Theme
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
          <option value="">Choose a theme</option>
          {COURSE_THEMES.map((theme) => (
            <option key={theme.id} value={theme.id}>
              {courseThemeLabel(theme.id, locale)}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-caption text-studio-muted">
        Pieces the student plays
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
          <option value="white">White</option>
          <option value="black">Black</option>
        </select>
      </label>
    </>
  );
}
