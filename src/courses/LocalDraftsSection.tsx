"use client";

import { Button } from "@/src/studio/ui/Button";
import { tCourse } from "@/src/i18n/course-strings";
import { formatInteger } from "@/src/i18n/format";
import { useStudioStore } from "@/src/store/studio-store";
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
  const locale = useStudioStore((state) => state.settings.locale);
  if (localDrafts.length === 0) {
    return null;
  }
  return (
    <section className="rounded-xl border border-studio-border p-4 lg:col-span-2">
      <h2 className="text-body font-medium text-studio-fg">{tCourse(locale, "course.drafts.heading")}</h2>
      <p className="mt-1 text-caption text-studio-muted">{tCourse(locale, "course.drafts.intro")}</p>
      <ul className="mt-3 space-y-2">
        {localDrafts.map((course, index) => {
          const conflict = findPublishedConflict(course.id, courses);
          const title =
            typeof course.title === "string" && course.title.trim()
              ? course.title.trim()
              : tCourse(locale, "course.drafts.untitled");
          const chapterCount = Array.isArray(course.chapters) ? course.chapters.length : 0;
          return (
            <li key={`${course.id}-${index}`} className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-body text-studio-fg">{title}</span>
              <span className="text-caption text-studio-muted">
                {chapterCount === 1
                  ? tCourse(locale, "course.drafts.chapters.one")
                  : tCourse(locale, "course.drafts.chapters.other", {
                      count: formatInteger(locale, chapterCount),
                    })}
              </span>
              {conflict ? (
                <span className="text-caption text-studio-warning-fg">
                  {tCourse(locale, "course.drafts.replaces", { title: conflict.title })}
                </span>
              ) : null}
              <Button
                variant={conflict ? "ghost" : "primary"}
                disabled={importingId !== null}
                onClick={() => onImport(course)}
              >
                {importingId === course.id
                  ? tCourse(locale, "course.drafts.importing")
                  : conflict
                    ? tCourse(locale, "course.drafts.replace")
                    : tCourse(locale, "course.drafts.import")}
              </Button>
            </li>
          );
        })}
      </ul>
      <Button variant="ghost" className="mt-3" disabled={importingId !== null} onClick={onDiscard}>
        {tCourse(locale, "course.drafts.discardAll")}
      </Button>
    </section>
  );
}
