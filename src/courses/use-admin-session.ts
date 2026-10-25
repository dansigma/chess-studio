"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { tCourseAdmin, type CourseAdminMessage } from "@/src/i18n/course-admin-strings";
import { useStudioStore } from "@/src/store/studio-store";
import { findPublishedConflict, isCourseId, isCourseTheme } from "./catalog";
import { currentUserCanPublish, publishCourse } from "./publish";
import {
  clearLocalCustomCourses,
  fetchPublishedCourses,
  readLocalCustomCourses,
  removeLocalCustomDraft,
} from "./store";
import type { Course } from "./types";

/**
 * Publisher session for the course admin: whether the account may publish, the
 * published library, and the browser-local drafts with their import/discard
 * flows. Failures are `CourseAdminMessage` keys resolved to the site locale at
 * render, since server actions never know the locale.
 */
export function useAdminSession() {
  const router = useRouter();
  const locale = useStudioStore((state) => state.settings.locale);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [localDrafts, setLocalDrafts] = useState<Course[]>([]);
  const [error, setError] = useState<CourseAdminMessage | null>(null);
  const [importingId, setImportingId] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    void (async () => {
      if (
        process.env.NODE_ENV === "development" &&
        new URLSearchParams(window.location.search).has("previewDrafts")
      ) {
        setAllowed(true);
        setCourses([
          {
            id: "11111111-1111-4111-8111-111111111111",
            slug: "preview-live",
            title: "Preview live course",
            summary: "",
            theme: "openings",
            color: "white",
            chapters: [],
          },
        ]);
        setLocalDrafts([
          {
            id: "11111111-1111-4111-8111-111111111111",
            slug: "preview-draft-replace",
            title: "Preview draft — replaces",
            summary: "",
            theme: "openings",
            color: "black",
            chapters: [
              { id: "c-1", title: "One", variations: [] },
              { id: "c-2", title: "Two", variations: [] },
            ],
          },
          {
            id: "22222222-2222-4222-8222-222222222222",
            slug: "preview-draft-new",
            title: "Preview draft — new",
            summary: "",
            theme: "strategy",
            color: "white",
            chapters: [{ id: "c-3", title: "Only", variations: [] }],
          },
        ]);
        return;
      }
      const allowedToPublish = await currentUserCanPublish();
      if (cancel) {
        return;
      }
      if (!allowedToPublish) {
        setAllowed(false);
        return;
      }
      setAllowed(true);
      const published = await fetchPublishedCourses();
      if (cancel) {
        return;
      }
      if (published.error) {
        setError({ key: "course.admin.error.loadFailed" });
        setCourses(published.courses);
        return;
      }
      setCourses(published.courses);
      setLocalDrafts(readLocalCustomCourses());
    })();
    return () => {
      cancel = true;
    };
  }, []);

  function refresh(next: Course[]) {
    setCourses(next);
  }

  async function importLocalDraft(course: Course) {
    const conflict = findPublishedConflict(course.id, courses);
    if (
      conflict &&
      !window.confirm(tCourseAdmin(locale, "course.admin.confirm.replaceDraft", { title: conflict.title }))
    ) {
      return;
    }
    setImportingId(course.id);
    try {
      const result = await publishCourse({
        ...course,
        id: isCourseId(course.id) ? course.id : crypto.randomUUID(),
        theme: isCourseTheme(course.theme) ? course.theme : "openings",
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setCourses((current) => [result.course, ...current.filter((item) => item.id !== result.course.id)]);
      setLocalDrafts((current) => current.filter((item) => item.id !== course.id));
      if (!removeLocalCustomDraft(course.id)) {
        setError({ key: "course.admin.error.staleCopy" });
      } else {
        setError(null);
      }
      router.refresh();
    } finally {
      setImportingId(null);
    }
  }

  function discardLocalDrafts() {
    if (!window.confirm(tCourseAdmin(locale, "course.admin.confirm.discardDrafts"))) {
      return;
    }
    clearLocalCustomCourses();
    setLocalDrafts([]);
  }

  return {
    allowed,
    courses,
    setCourses,
    localDrafts,
    error,
    setError,
    importingId,
    importLocalDraft,
    discardLocalDrafts,
    refresh,
  };
}
