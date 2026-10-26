"use client";

import type { Dispatch, SetStateAction } from "react";
import dynamic from "next/dynamic";
import { tCourseAdmin } from "@/src/i18n/course-admin-strings";
import { courseThemeLabel, isCourseAccessTier, isCourseColor, isCourseTheme, slugify } from "./catalog";
import type { CourseDraft } from "./admin-draft";
import { centsToPrice, priceToCents } from "./author-actions";
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

/** The course metadata fields above the chapter list (address through author). */
export function CourseFields({
  draft,
  setDraft,
  readOnly = false,
  priceText,
  setPriceText,
}: {
  draft: CourseDraft;
  setDraft: Dispatch<SetStateAction<CourseDraft>>;
  /** SIG-1114: `in_review` renders every input disabled. */
  readOnly?: boolean;
  /** SIG-1114: raw reais text for the paid price (owned by AdminView so save can parse it). */
  priceText?: string;
  setPriceText?: (text: string) => void;
}) {
  const locale = useStudioStore((state) => state.settings.locale);
  const priceValue = priceText ?? (draft.priceCents != null ? centsToPrice(draft.priceCents, locale) : "");
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
          disabled={readOnly}
          onChange={(event) => setDraft({ ...draft, slug: event.target.value })}
          placeholder={slugify(draft.title) || "my-course"}
          className="mt-1 w-full rounded-lg border border-studio-border bg-studio-chrome px-3 py-2 text-body text-studio-fg"
        />
      </label>
      <label className="block text-caption text-studio-muted">
        {tCourseAdmin(locale, "course.admin.field.title")}
        <input
          value={draft.title}
          disabled={readOnly}
          onChange={(event) => setDraft({ ...draft, title: event.target.value })}
          className="mt-1 w-full rounded-lg border border-studio-border bg-studio-chrome px-3 py-2 text-body text-studio-fg"
        />
      </label>
      <div className="block text-caption text-studio-muted">
        {tCourseAdmin(locale, "course.admin.field.description")}
        {readOnly ? (
          <div
            className="mt-1 min-h-36 rounded-lg border border-studio-border bg-studio-chrome px-3 py-2 text-body text-studio-fg"
            // The summary is sanitized HTML (checkedCourse); render it
            // read-only rather than mounting the TipTap editor.
            dangerouslySetInnerHTML={{ __html: draft.summary }}
          />
        ) : (
          <DescriptionField
            key={`${draft.id}-${locale}`}
            value={draft.summary}
            onChange={(summary) => setDraft((current) => ({ ...current, summary }))}
          />
        )}
      </div>
      <label className="block text-caption text-studio-muted">
        {tCourseAdmin(locale, "course.admin.field.cover")}
        <input
          value={draft.coverUrl ?? ""}
          disabled={readOnly}
          onChange={(event) => setDraft({ ...draft, coverUrl: event.target.value })}
          placeholder="https://"
          className="mt-1 w-full rounded-lg border border-studio-border bg-studio-chrome px-3 py-2 text-body text-studio-fg"
        />
      </label>
      <label className="block text-caption text-studio-muted">
        {tCourseAdmin(locale, "course.admin.field.video")}
        <input
          value={draft.videoUrl ?? ""}
          disabled={readOnly}
          onChange={(event) => setDraft({ ...draft, videoUrl: event.target.value })}
          placeholder={tCourseAdmin(locale, "course.admin.field.videoPlaceholder")}
          className="mt-1 w-full rounded-lg border border-studio-border bg-studio-chrome px-3 py-2 text-body text-studio-fg"
        />
      </label>
      <label className="block text-caption text-studio-muted">
        {tCourseAdmin(locale, "course.admin.field.theme")}
        <select
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
      </label>
      <label className="block text-caption text-studio-muted">
        {tCourseAdmin(locale, "course.admin.field.pieces")}
        <select
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
      </label>
      <label className="block text-caption text-studio-muted">
        {tCourseAdmin(locale, "course.admin.field.accessTier")}
        <select
          value={draft.accessTier}
          disabled={readOnly}
          onChange={(event) => {
            const tier = event.target.value;
            if (isCourseAccessTier(tier)) {
              // Leaving `paid` clears the price; entering it starts blank so
              // the author must type an explicit reais value.
              setDraft({ ...draft, accessTier: tier, priceCents: tier === "paid" ? draft.priceCents : null });
              setPriceText?.(tier === "paid" ? "" : "");
            }
          }}
          className="mt-1 rounded-lg border border-studio-border bg-studio-chrome px-3 py-2 text-body text-studio-fg"
        >
          <option value="free">{tCourseAdmin(locale, "course.admin.field.tier.free")}</option>
          <option value="premium">{tCourseAdmin(locale, "course.admin.field.tier.premium")}</option>
          <option value="paid">{tCourseAdmin(locale, "course.admin.field.tier.paid")}</option>
        </select>
      </label>
      {draft.accessTier === "paid" ? (
        <label className="block text-caption text-studio-muted">
          {tCourseAdmin(locale, "course.admin.field.price")}
          <input
            value={priceValue}
            disabled={readOnly}
            inputMode="decimal"
            onChange={(event) => {
              const text = event.target.value;
              setPriceText?.(text);
              // Keep priceCents in sync for callers that read the draft
              // directly; submit re-parses and validates anyway.
              const cents = priceToCents(text);
              setDraft((current) => ({ ...current, priceCents: cents }));
            }}
            placeholder="19,90"
            className="mt-1 w-full rounded-lg border border-studio-border bg-studio-chrome px-3 py-2 text-body text-studio-fg"
          />
          <span className="mt-1 block text-caption text-studio-faint">
            {tCourseAdmin(locale, "course.admin.field.priceHint")}
          </span>
        </label>
      ) : null}
      <label className="block text-caption text-studio-muted">
        {tCourseAdmin(locale, "course.admin.field.authorName")}
        <input
          value={draft.authorName ?? ""}
          disabled={readOnly}
          maxLength={120}
          onChange={(event) => setDraft({ ...draft, authorName: event.target.value })}
          placeholder={tCourseAdmin(locale, "course.admin.field.authorNamePlaceholder")}
          className="mt-1 w-full rounded-lg border border-studio-border bg-studio-chrome px-3 py-2 text-body text-studio-fg"
        />
      </label>
    </>
  );
}
