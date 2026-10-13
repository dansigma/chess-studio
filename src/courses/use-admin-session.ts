"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
 * flows. `router.refresh()` is called after an import so the server-rendered
 * catalog re-hydrates for the publisher.
 */
export function useAdminSession() {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [localDrafts, setLocalDrafts] = useState<Course[]>([]);
  const [error, setError] = useState("");
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
        setError(published.error);
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
    if (conflict && !window.confirm(`Replace the published course “${conflict.title}” with this browser draft?`)) {
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
        setError("Published, but the browser copy could not be removed — it may reappear on reload.");
      } else {
        setError("");
      }
      router.refresh();
    } finally {
      setImportingId(null);
    }
  }

  function discardLocalDrafts() {
    if (!window.confirm("Discard the drafts saved in this browser? This cannot be undone.")) {
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
