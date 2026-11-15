import type { CourseAdminErrorKey, CourseAdminMessage } from "@/src/i18n/course-admin-strings";
import { validateTierAndPrice } from "./author-actions";
import { isCourseColor, isCourseId, isCourseTheme, parseChapters, slugify } from "./catalog";
import { validateCatalogFields } from "./catalog-fields";
import { countDescriptionDiagrams, sanitizeCourseHtml } from "./description";
import { hasPlayableContent, normalizeChapters } from "./draft";
import { COURSES_FREE_LAUNCH } from "./free-launch";
import { courseCoverUrl, courseVideo } from "./media";
import type { CourseDraft } from "./admin-draft";
import type { CourseAccessTier } from "./types";

/** SIG-1368: the sanitized description length cap (each diagram carries a FEN) and the diagram cap. */
export const MAX_DESCRIPTION_LENGTH = 20000;
export const MAX_DESCRIPTION_DIAGRAMS = 12;

/** SIG-1363: the editor tabs, in display order. */
export const COURSE_ADMIN_TABS = ["info", "description", "media", "chapters", "preview"] as const;
export type CourseAdminTab = (typeof COURSE_ADMIN_TABS)[number];

/** The editor field an error points at. */
export type CourseField =
  | "title"
  | "slug"
  | "theme"
  | "color"
  | "authorName"
  | "level"
  | "language"
  | "elo"
  | "duration"
  | "summary"
  | "coverUrl"
  | "videoUrl"
  | "chapters"
  /** SIG-1365: the video link input of one chapter. */
  | `chapterVideo:${string}`;

export type FieldLocation = { tab: CourseAdminTab; field: CourseField };

/** An error message together with the tab and field that caused it. */
export type LocatedError = { error: CourseAdminMessage } & FieldLocation;

const LOCATIONS: Partial<Record<CourseAdminErrorKey, FieldLocation>> = {
  "course.admin.error.needsTitle": { tab: "info", field: "title" },
  "course.admin.error.chooseColor": { tab: "info", field: "color" },
  "course.admin.error.chooseTheme": { tab: "info", field: "theme" },
  "course.admin.error.needsAddress": { tab: "info", field: "slug" },
  "course.admin.error.addressInUse": { tab: "info", field: "slug" },
  "course.admin.error.authorNameTooLong": { tab: "info", field: "authorName" },
  "course.admin.error.invalidLevel": { tab: "info", field: "level" },
  "course.admin.error.invalidLanguage": { tab: "info", field: "language" },
  "course.admin.error.eloIncomplete": { tab: "info", field: "elo" },
  "course.admin.error.eloOutOfRange": { tab: "info", field: "elo" },
  "course.admin.error.eloOrder": { tab: "info", field: "elo" },
  "course.admin.error.invalidDuration": { tab: "info", field: "duration" },
  "course.admin.error.descriptionTooLong": { tab: "description", field: "summary" },
  "course.admin.error.tooManyDiagrams": { tab: "description", field: "summary" },
  "course.admin.error.coverHost": { tab: "media", field: "coverUrl" },
  "course.admin.error.videoLink": { tab: "media", field: "videoUrl" },
  "course.admin.error.tooManyChapters": { tab: "chapters", field: "chapters" },
  "course.admin.error.tooManyLines": { tab: "chapters", field: "chapters" },
  "course.admin.error.chapterVideoLink": { tab: "chapters", field: "chapters" },
  "course.admin.error.chapterDescriptionTooLong": { tab: "chapters", field: "chapters" },
  "course.admin.error.lineNeedsPgn": { tab: "chapters", field: "chapters" },
  "course.admin.error.lineTooLong": { tab: "chapters", field: "chapters" },
  "course.admin.error.lineNoMoves": { tab: "chapters", field: "chapters" },
  "course.admin.error.needsPlayableLine": { tab: "chapters", field: "chapters" },
};

/** Maps an error message (client or server) to its tab and field, or null when it is not about one field. */
export function locateError(error: CourseAdminMessage): LocatedError | null {
  const location = locationOf(error);
  return location ? { error, ...location } : null;
}

/** The chapter video error carries the failing chapter id so the editor can focus its own input. */
function locationOf(error: CourseAdminMessage): FieldLocation | undefined {
  const chapterId = error.vars?.chapterId;
  if (error.key === "course.admin.error.chapterVideoLink" && typeof chapterId === "string" && chapterId) {
    return { tab: "chapters", field: `chapterVideo:${chapterId}` };
  }
  return LOCATIONS[error.key];
}

export type DraftValidation =
  | { ok: true }
  | { ok: false; error: CourseAdminMessage; tab?: CourseAdminTab; field?: CourseField };

function fail(error: CourseAdminMessage): DraftValidation {
  return { ok: false, error, ...locationOf(error) };
}

/**
 * The single source of the course rules: used by the editor before saving and
 * by `checkedCourse` on the server. Pure; the order of the checks is the order
 * the author sees errors in. `tab` and `field` are absent only for errors that
 * do not belong to one field (such as an invalid id).
 */
export function validateCourseDraft(draft: CourseDraft): DraftValidation {
  const title = draft.title.trim();
  if (!title || title.length > 120) {
    return fail({ key: "course.admin.error.needsTitle" });
  }
  if (!isCourseId(draft.id)) {
    return fail({ key: "course.admin.error.invalidId" });
  }
  if (!isCourseColor(draft.color)) {
    return fail({ key: "course.admin.error.chooseColor" });
  }
  if (!isCourseTheme(draft.theme)) {
    return fail({ key: "course.admin.error.chooseTheme" });
  }
  // SIG-1114: tier/price invariant; SIG-1353: free launch forces free.
  let tier: CourseAccessTier = draft.accessTier === "paid" || draft.accessTier === "premium" ? draft.accessTier : "free";
  let price = typeof draft.priceCents === "number" ? draft.priceCents : null;
  if (COURSES_FREE_LAUNCH) {
    tier = "free";
    price = null;
  }
  const tierPrice = validateTierAndPrice(tier, price);
  if (!tierPrice.ok) {
    return fail({ key: tierPrice.error });
  }
  const catalogError = validateCatalogFields(draft);
  if (catalogError) {
    return fail(catalogError);
  }
  if ((draft.authorName?.trim() ?? "").length > 120) {
    return fail({ key: "course.admin.error.authorNameTooLong" });
  }
  const summary = sanitizeCourseHtml(draft.summary);
  if (summary.length > MAX_DESCRIPTION_LENGTH) {
    return fail({ key: "course.admin.error.descriptionTooLong" });
  }
  if (countDescriptionDiagrams(summary) > MAX_DESCRIPTION_DIAGRAMS) {
    return fail({ key: "course.admin.error.tooManyDiagrams" });
  }
  const coverInput = draft.coverUrl?.trim() ?? "";
  if (coverInput && !courseCoverUrl(coverInput)) {
    return fail({ key: "course.admin.error.coverHost" });
  }
  const videoInput = draft.videoUrl?.trim() ?? "";
  if (videoInput && !courseVideo(videoInput)) {
    return fail({ key: "course.admin.error.videoLink" });
  }
  if (!(slugify(draft.slug.trim()) || slugify(title))) {
    return fail({ key: "course.admin.error.needsAddress" });
  }
  const normalized = normalizeChapters(parseChapters(draft.chapters));
  if ("error" in normalized) {
    return fail(normalized.error);
  }
  if (!hasPlayableContent(normalized.chapters)) {
    return fail({ key: "course.admin.error.needsPlayableLine" });
  }
  return { ok: true };
}
