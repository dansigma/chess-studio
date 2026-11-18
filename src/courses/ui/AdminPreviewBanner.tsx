"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { tCourse } from "@/src/i18n/course-strings";
import type { SiteLocale } from "@/src/i18n/locale";

/**
 * SIG-1396: banner rendered at the top of CourseView and LessonView when an
 * admin previews a submitted (`in_review`) course from the review queue.
 */
export function AdminPreviewBanner({
  href,
  locale,
}: {
  href: string;
  locale: SiteLocale;
}) {
  return (
    <div
      role="status"
      data-admin-preview-banner
      className="shrink-0 border-b border-studio-border bg-studio-warning-bg px-4 py-2 text-dense text-studio-warning-fg"
    >
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2">
        <span>{tCourse(locale, "course.preview.banner")}</span>
        <Link
          href={href}
          className="inline-flex items-center gap-1.5 font-medium underline-offset-2 hover:underline"
        >
          <ArrowLeft size={14} aria-hidden />
          {tCourse(locale, "course.preview.backToQueue")}
        </Link>
      </div>
    </div>
  );
}
