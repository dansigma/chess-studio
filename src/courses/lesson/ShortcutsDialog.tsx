"use client";

import { tCourse } from "@/src/i18n/course-strings";
import type { SiteLocale } from "@/src/i18n/locale";
import { Dialog } from "@/src/studio/ui/Dialog";
import { Kbd } from "@/src/studio/ui/Controls";

export function ShortcutsDialog({
  locale,
  onClose,
}: {
  locale: SiteLocale;
  onClose: () => void;
}) {
  const rows: Array<[string, string]> = [
    ["Home", tCourse(locale, "course.lesson.transport.start")],
    ["←", tCourse(locale, "course.lesson.transport.back")],
    ["→", tCourse(locale, "course.lesson.transport.forward")],
    ["End", tCourse(locale, "course.lesson.transport.end")],
    ["F", tCourse(locale, "course.lesson.flip")],
    ["?", tCourse(locale, "course.lesson.shortcuts.title")],
  ];
  return (
    <Dialog
      title={tCourse(locale, "course.lesson.shortcuts.title")}
      onClose={onClose}
    >
      <dl className="space-y-2">
        {rows.map(([key, label]) => (
          <div key={key} className="flex items-center justify-between gap-4">
            <dt>{label}</dt>
            <dd>
              <Kbd>{key}</Kbd>
            </dd>
          </div>
        ))}
      </dl>
    </Dialog>
  );
}
