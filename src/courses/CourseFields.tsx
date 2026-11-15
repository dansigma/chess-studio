"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import dynamic from "next/dynamic";
import { tCourseAdmin } from "@/src/i18n/course-admin-strings";
import { courseThemeLabel, isCourseColor, isCourseTheme, slugify } from "./catalog";
import type { CourseDraft } from "./admin-draft";
import { FieldError, fieldControlProps, fieldDomId } from "./FieldError";
import type { LocatedError } from "./validate-draft";
import { locateError } from "./validate-draft";
import { COURSE_LEVELS, validateCatalogFields } from "./catalog-fields";
import { digitsOnly, eloInputText, hmFromMinutes, minutesFromHm, parseEloInput } from "./duration-input";
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
      <CatalogFields draft={draft} setDraft={setDraft} readOnly={readOnly} error={error} />
    </>
  );
}

const LEVEL_KEYS = {
  beginner: "course.admin.field.levelBeginner",
  intermediate: "course.admin.field.levelIntermediate",
  advanced: "course.admin.field.levelAdvanced",
} as const;

const NUMBER_INPUT_CLASS =
  "mt-1 w-24 rounded-lg border border-studio-border bg-studio-chrome px-3 py-2 text-body text-studio-fg";

/** SIG-1364: level, Elo range, language and estimated duration. */
function CatalogFields({ draft, setDraft, readOnly, error }: FieldsProps) {
  const locale = useStudioStore((state) => state.settings.locale);
  const [eloTouched, setEloTouched] = useState(false);
  const [lastMinutes, setLastMinutes] = useState(draft.durationMinutes);
  const [hm, setHm] = useState(() => hmFromMinutes(draft.durationMinutes));
  if (draft.durationMinutes !== lastMinutes) {
    // The draft changed from outside (load, new course, save): resync the texts.
    setLastMinutes(draft.durationMinutes);
    setHm(hmFromMinutes(draft.durationMinutes));
  }

  // The Elo pair is checked once the author leaves it, with the save-time rules.
  const eloCheck = eloTouched ? validateCatalogFields(draft) : null;
  const eloLocal = eloCheck ? locateError(eloCheck) : null;
  const eloError = error?.field === "elo" ? error : eloLocal?.field === "elo" ? eloLocal : null;

  function setDuration(next: { hours: string; minutes: string }) {
    const minutes = minutesFromHm(next.hours, next.minutes);
    setHm(next);
    setLastMinutes(minutes);
    setDraft({ ...draft, durationMinutes: minutes });
  }

  function leaveEloGroup(event: React.FocusEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setEloTouched(true);
    }
  }

  return (
    <>
      <fieldset className="block text-caption text-studio-muted" disabled={readOnly}>
        <legend className="mb-1">{tCourseAdmin(locale, "course.admin.field.level")}</legend>
        <div role="radiogroup" aria-label={tCourseAdmin(locale, "course.admin.field.level")} className="inline-flex overflow-hidden rounded-lg border border-studio-border">
          {COURSE_LEVELS.map((level, index) => (
            <label
              key={level}
              className="cursor-pointer border-studio-border px-3 py-2 text-body text-studio-fg not-first:border-l has-checked:bg-studio-chrome-hover has-checked:font-semibold has-focus-visible:ring-2"
            >
              <input
                {...(index === 0 ? fieldControlProps("level", error) : {})}
                type="radio"
                name="course-level"
                value={level}
                checked={draft.level === level}
                onChange={() => setDraft({ ...draft, level })}
                className="sr-only"
              />
              {tCourseAdmin(locale, LEVEL_KEYS[level])}
            </label>
          ))}
        </div>
        <FieldError field="level" error={error} locale={locale} />
      </fieldset>
      <fieldset className="block text-caption text-studio-muted" disabled={readOnly}>
        <legend>{tCourseAdmin(locale, "course.admin.field.elo")}</legend>
        <div className="flex items-center gap-2" onBlur={leaveEloGroup}>
          <input
            {...fieldControlProps("elo", eloError)}
            inputMode="numeric"
            aria-label={tCourseAdmin(locale, "course.admin.field.eloMin")}
            placeholder="min"
            value={eloInputText(draft.eloMin)}
            onChange={(event) => setDraft({ ...draft, eloMin: parseEloInput(event.target.value) })}
            className={NUMBER_INPUT_CLASS}
          />
          <span aria-hidden="true">–</span>
          <input
            inputMode="numeric"
            aria-label={tCourseAdmin(locale, "course.admin.field.eloMax")}
            aria-invalid={eloError ? true : undefined}
            aria-describedby={eloError ? "course-field-elo-error" : undefined}
            placeholder="max"
            value={eloInputText(draft.eloMax)}
            onChange={(event) => setDraft({ ...draft, eloMax: parseEloInput(event.target.value) })}
            className={NUMBER_INPUT_CLASS}
          />
        </div>
        <FieldError field="elo" error={eloError} locale={locale} />
      </fieldset>
      <label className="block text-caption text-studio-muted">
        {tCourseAdmin(locale, "course.admin.field.language")}
        <select
          {...fieldControlProps("language", error)}
          value={draft.language}
          disabled={readOnly}
          onChange={(event) => {
            const language = event.target.value;
            if (language === "pt-br" || language === "en") {
              setDraft({ ...draft, language });
            }
          }}
          className="mt-1 rounded-lg border border-studio-border bg-studio-chrome px-3 py-2 text-body text-studio-fg"
        >
          <option value="pt-br">{tCourseAdmin(locale, "course.admin.field.languagePt")}</option>
          <option value="en">{tCourseAdmin(locale, "course.admin.field.languageEn")}</option>
        </select>
        <FieldError field="language" error={error} locale={locale} />
      </label>
      <fieldset className="block text-caption text-studio-muted" disabled={readOnly}>
        <legend>{tCourseAdmin(locale, "course.admin.field.duration")}</legend>
        <div className="flex items-center gap-2">
          <input
            {...fieldControlProps("duration", error)}
            inputMode="numeric"
            aria-label={tCourseAdmin(locale, "course.admin.field.durationHours")}
            value={hm.hours}
            onChange={(event) => setDuration({ ...hm, hours: digitsOnly(event.target.value) })}
            className={NUMBER_INPUT_CLASS}
          />
          <span>h</span>
          <input
            inputMode="numeric"
            aria-label={tCourseAdmin(locale, "course.admin.field.durationMinutes")}
            aria-invalid={error?.field === "duration" ? true : undefined}
            value={hm.minutes}
            onChange={(event) => setDuration({ ...hm, minutes: digitsOnly(event.target.value) })}
            className={NUMBER_INPUT_CLASS}
          />
          <span>min</span>
        </div>
        <FieldError field="duration" error={error} locale={locale} />
      </fieldset>
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
        <div
          className="mt-1 min-h-36 rounded-lg border border-studio-border bg-studio-chrome px-3 py-2 text-body text-studio-fg"
          // The summary is sanitized HTML (sanitizeCourseHtml, applied in
          // checkedCourse); render it read-only rather than mounting the
          // TipTap editor.
          dangerouslySetInnerHTML={{ __html: draft.summary }}
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
