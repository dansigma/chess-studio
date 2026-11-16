"use client";

import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { tCourse } from "@/src/i18n/course-strings";
import type { SiteLocale } from "@/src/i18n/locale";
import { courseVideo } from "../media";
import { VideoEmbed } from "../ui/VideoEmbed";
import { useStoredFlag } from "./stored-flag";

export const VIDEO_COLLAPSED_KEY = "chess-studio-lesson-video-collapsed";

/** SIG-1387: phones start with the chapter video collapsed. */
function videoCollapsedByDefault(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  try {
    return window.matchMedia("(max-width: 639px)").matches;
  } catch {
    return false;
  }
}

/**
 * Board on the left, panel on the right (stacked below the board on phones).
 * The panel holds the chapter video in a collapsible block (state remembered)
 * and then the line content.
 *
 * Below `lg` the panel is capped (`max-lg:max-h-[45dvh]`) so only its body
 * scrolls; the optional `footer` (the lesson/review action row) sits after the
 * scrolling body, so its buttons stay above the fold on short screens.
 */
export function StudyLayout({
  locale,
  board,
  controls,
  videoUrl,
  videoTitle,
  footer,
  children,
}: {
  locale: SiteLocale;
  board: ReactNode;
  controls: ReactNode;
  videoUrl: string | undefined;
  videoTitle: string;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useStoredFlag(
    VIDEO_COLLAPSED_KEY,
    videoCollapsedByDefault,
  );
  const hasVideo = courseVideo(videoUrl) !== null;
  return (
    <div className="mx-auto grid min-h-0 w-full max-w-5xl flex-1 grid-rows-[minmax(0,1fr)_auto] gap-3 overflow-y-auto px-4 py-3 lg:grid-cols-[minmax(0,520px)_minmax(0,1fr)] lg:grid-rows-1 lg:gap-6 lg:overflow-visible lg:py-6">
      <div className="flex h-full min-h-0 w-full items-center justify-center [container-type:size]">
        <div className="size-[min(100cqw,100cqh,520px)] overflow-hidden rounded-lg shadow-[0_6px_20px_rgb(0_0_0/0.28)] ring-1 ring-studio-border-strong">
          {board}
        </div>
      </div>
      <section className="flex min-h-36 max-lg:max-h-[45dvh] flex-col overflow-hidden rounded-xl border border-studio-border bg-studio-chrome lg:max-h-[calc(100dvh-8rem)] lg:min-h-0 lg:self-start">
        <div className="flex shrink-0 items-center border-b border-studio-border px-1.5 py-1">
          {controls}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {videoUrl && hasVideo ? (
            <div className="border-b border-studio-border px-4 py-2">
              <button
                type="button"
                aria-expanded={!collapsed}
                onClick={() => setCollapsed(!collapsed)}
                className="flex w-full items-center justify-between text-caption font-medium text-studio-muted hover:text-studio-fg"
              >
                {tCourse(locale, "course.lesson.video.heading")}
                <ChevronDown
                  size={14}
                  aria-hidden
                  className={collapsed ? "-rotate-90" : ""}
                />
              </button>
              {collapsed ? null : (
                <VideoEmbed url={videoUrl} title={videoTitle} />
              )}
            </div>
          ) : null}
          {children}
        </div>
        {footer ? (
          <div className="shrink-0 border-t border-studio-border p-3">
            {footer}
          </div>
        ) : null}
      </section>
    </div>
  );
}
