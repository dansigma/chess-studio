"use client";

import { useEffect, useRef, useState } from "react";
import { appendChapterPgn, emptyCourse, importChapterPgn, type CourseDraft } from "./admin-draft";
import { moveListItem } from "./draft";
import type { CourseChapter, CourseVariation } from "./types";

/**
 * Owns the editable course draft and its chapter/line mutations. Errors are
 * reported through the caller's `setError` so the admin form keeps a single
 * error slot alongside the session state.
 */
export function useAdminDraft(setError: (message: string) => void) {
  const [draft, setDraft] = useState<CourseDraft>(emptyCourse);
  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  });

  function updateChapter(chapterId: string, patch: Partial<CourseChapter>) {
    setDraft({
      ...draft,
      chapters: draft.chapters.map((chapter) => (chapter.id === chapterId ? { ...chapter, ...patch } : chapter)),
    });
  }

  function updateVariation(chapterId: string, variationId: string, patch: Partial<CourseVariation>) {
    setDraft({
      ...draft,
      chapters: draft.chapters.map((chapter) =>
        chapter.id === chapterId
          ? {
              ...chapter,
              variations: chapter.variations.map((variation) =>
                variation.id === variationId ? { ...variation, ...patch } : variation,
              ),
            }
          : chapter,
      ),
    });
  }

  function moveChapter(index: number, direction: -1 | 1) {
    setDraft((current) => ({ ...current, chapters: moveListItem(current.chapters, index, direction) }));
  }

  function moveVariation(chapterId: string, index: number, direction: -1 | 1) {
    setDraft((current) => ({
      ...current,
      chapters: current.chapters.map((chapter) =>
        chapter.id === chapterId
          ? { ...chapter, variations: moveListItem(chapter.variations, index, direction) }
          : chapter,
      ),
    }));
  }

  async function addChapterPgn(chapterId: string, file: File) {
    let text = "";
    try {
      text = await file.text();
    } catch {
      setError("That PGN file could not be read.");
      return;
    }
    const update = importChapterPgn(text, draftRef.current.chapters, chapterId);
    if (update === null) {
      return;
    }
    if ("error" in update) {
      setError(update.error);
      return;
    }
    setDraft((current) => ({
      ...current,
      chapters: appendChapterPgn(current.chapters, chapterId, update),
    }));
    setError("");
  }

  return { draft, setDraft, updateChapter, updateVariation, moveChapter, moveVariation, addChapterPgn };
}
