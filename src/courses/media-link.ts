import type { CourseAdminErrorKey } from "@/src/i18n/course-admin-strings";
import { courseCoverUrl, courseVideo, type CourseVideo } from "./media";

export type MediaLinkKind = "cover" | "video";

/** SIG-1365: what the editor shows for a link as the author types. */
export type MediaLinkState =
  | { state: "empty" }
  | { state: "invalid"; errorKey: CourseAdminErrorKey }
  | { state: "valid"; kind: "cover"; url: string }
  | { state: "valid"; kind: "video"; video: CourseVideo; url: string };

/** Pure; same rules as `validateCourseDraft` (it calls the same helpers). */
export function validateMediaLink(kind: MediaLinkKind, value: string | null | undefined): MediaLinkState {
  const input = value?.trim() ?? "";
  if (!input) {
    return { state: "empty" };
  }
  if (kind === "cover") {
    const url = courseCoverUrl(input);
    return url ? { state: "valid", kind, url } : { state: "invalid", errorKey: "course.admin.error.coverHost" };
  }
  const video = courseVideo(input);
  return video ? { state: "valid", kind, video, url: input } : { state: "invalid", errorKey: "course.admin.error.videoLink" };
}
