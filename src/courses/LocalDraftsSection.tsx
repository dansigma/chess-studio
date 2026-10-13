"use client";

import { Button } from "@/src/studio/ui/Button";
import { findPublishedConflict } from "./catalog";
import type { Course } from "./types";

/** Browser-local drafts with their import/conflict and discard actions. */
export function LocalDraftsSection({
  localDrafts,
  courses,
  importingId,
  onImport,
  onDiscard,
}: {
  localDrafts: Course[];
  courses: Course[];
  importingId: string | null;
  onImport: (course: Course) => void;
  onDiscard: () => void;
}) {
  if (localDrafts.length === 0) {
    return null;
  }
  return (
    <section className="rounded-xl border border-studio-border p-4 lg:col-span-2">
      <h2 className="text-body font-medium text-studio-fg">Drafts saved in this browser</h2>
      <p className="mt-1 text-caption text-studio-muted">
        These courses live only in this browser. Import a draft to publish it for every student. Nothing is
        published automatically.
      </p>
      <ul className="mt-3 space-y-2">
        {localDrafts.map((course, index) => {
          const conflict = findPublishedConflict(course.id, courses);
          const title =
            typeof course.title === "string" && course.title.trim() ? course.title.trim() : "Untitled course";
          const chapterCount = Array.isArray(course.chapters) ? course.chapters.length : 0;
          return (
            <li key={`${course.id}-${index}`} className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-body text-studio-fg">{title}</span>
              <span className="text-caption text-studio-muted">
                {chapterCount === 1 ? "1 chapter" : `${chapterCount} chapters`}
              </span>
              {conflict ? (
                <span className="text-caption text-studio-warning-fg">Replaces “{conflict.title}”</span>
              ) : null}
              <Button
                variant={conflict ? "ghost" : "primary"}
                disabled={importingId !== null}
                onClick={() => onImport(course)}
              >
                {importingId === course.id ? "Importing…" : conflict ? "Replace" : "Import"}
              </Button>
            </li>
          );
        })}
      </ul>
      <Button variant="ghost" className="mt-3" disabled={importingId !== null} onClick={onDiscard}>
        Discard all drafts
      </Button>
    </section>
  );
}
