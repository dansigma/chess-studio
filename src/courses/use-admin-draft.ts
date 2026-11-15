"use client";

import { useEffect, useRef, useState } from "react";
import type { CourseAdminMessage } from "@/src/i18n/course-admin-strings";
import { appendChapterPgn, emptyCourse, importChapterPgn, type CourseDraft } from "./admin-draft";
import type { ChapterPgnWarning } from "./chapter-pgn";
import { duplicateChapter, duplicateVariation, moveListItem, moveListItemTo } from "./draft";
import type { CourseChapter, CourseVariation } from "./types";

/**
 * Owns the editable course draft and its chapter/line mutations. Errors are
 * reported through the caller's `setError` so the admin form keeps a single
 * error slot alongside the session state.
 */
export function useAdminDraft(setError: (message: CourseAdminMessage | null) => void) {
  const [draft, setDraft] = useState<CourseDraft>(emptyCourse);
  // SIG-1366: lines whose imported PGN skipped moves, surfaced above the chapters.
  const [importWarnings, setImportWarnings] = useState<ChapterPgnWarning[]>([]);
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

  function moveChapterTo(from: number, to: number) {
    setDraft((current) => ({ ...current, chapters: moveListItemTo(current.chapters, from, to) }));
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

  function moveVariationTo(chapterId: string, from: number, to: number) {
    setDraft((current) => ({
      ...current,
      chapters: current.chapters.map((chapter) =>
        chapter.id === chapterId
          ? { ...chapter, variations: moveListItemTo(chapter.variations, from, to) }
          : chapter,
      ),
    }));
  }

  function duplicateChapterInDraft(chapterId: string) {
    setDraft((current) => ({ ...current, chapters: duplicateChapter(current.chapters, chapterId) }));
  }

  function duplicateVariationInChapter(chapterId: string, variationId: string) {
    setDraft((current) => ({
      ...current,
      chapters: current.chapters.map((chapter) =>
        chapter.id === chapterId ? duplicateVariation(chapter, variationId) : chapter,
      ),
    }));
  }

  function clearImportWarnings() {
    setImportWarnings([]);
  }

  async function addChapterPgn(chapterId: string, file: File) {
    setImportWarnings([]);
    let text = "";
    try {
      text = await file.text();
    } catch {
      setError({ key: "course.admin.error.pgnUnreadable" });
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
    setImportWarnings(update.warnings);
    setError(null);
  }

  return {
    draft,
    setDraft,
    updateChapter,
    updateVariation,
    moveChapter,
    moveChapterTo,
    moveVariation,
    moveVariationTo,
    duplicateChapter: duplicateChapterInDraft,
    duplicateVariation: duplicateVariationInChapter,
    importWarnings,
    clearImportWarnings,
    addChapterPgn,
  };
}
