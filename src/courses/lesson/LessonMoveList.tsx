"use client";

import { useEffect, useRef } from "react";
import { tCourse } from "@/src/i18n/course-strings";
import type { SiteLocale } from "@/src/i18n/locale";
import type { LessonFrame } from "../lesson.ts";
import { moveListModel } from "./move-list.ts";

const MOVE_BUTTON =
  "rounded-[5px] px-1.5 py-0.5 text-sm font-medium leading-5";

function moveClass(current: boolean): string {
  return `${MOVE_BUTTON} ${
    current
      ? "bg-studio-accent-move text-studio-accent-fg"
      : "text-studio-fg hover:bg-studio-hover-strong"
  }`;
}

function useKeepInView(step: number) {
  const ref = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    ref.current?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [step]);
  return ref;
}

/**
 * Frames-based move list: the moves reached so far with each author comment
 * beneath it. Moves not yet reached are never rendered. Selecting a move only
 * changes the viewed step; it never touches saved progress.
 */
export function LessonMoveList({
  locale,
  frames,
  reachedStep,
  viewStep,
  onSelect,
  showComments = true,
}: {
  locale: SiteLocale;
  frames: LessonFrame[];
  reachedStep: number;
  viewStep: number;
  onSelect: (step: number) => void;
  /** Treinar hides every author comment; only the moves remain. */
  showComments?: boolean;
}) {
  const model = moveListModel(frames, reachedStep, viewStep);
  const currentRef = useKeepInView(viewStep);
  return (
    <div data-lesson-move-list="" className="hidden px-4 py-3 lg:block">
      {showComments && model.opening ? (
        <p className="mb-2 text-body leading-relaxed text-studio-comment">
          {model.opening}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-0.5 gap-y-1">
        {model.entries.map((entry) => (
          <span key={entry.step} className="contents">
            {entry.showNumber ? (
              <span className="pl-1 text-sm tabular-nums text-studio-muted">
                {entry.label}
              </span>
            ) : null}
            <button
              type="button"
              ref={entry.current ? currentRef : undefined}
              data-move-step={entry.step}
              aria-current={entry.current ? "step" : undefined}
              onClick={() => onSelect(entry.step)}
              className={moveClass(entry.current)}
            >
              {entry.san}
            </button>
            {showComments && entry.comment ? (
              <p className="my-1 basis-full text-body leading-relaxed text-studio-comment">
                {entry.comment}
              </p>
            ) : null}
          </span>
        ))}
        {model.pending ? (
          <span data-your-turn="" className="contents">
            <span className="pl-1 text-sm tabular-nums text-studio-muted">
              {model.pending.label}
            </span>
            <span className="rounded-[5px] bg-studio-hover px-1.5 py-0.5 text-sm font-medium text-studio-accent-text">
              {tCourse(locale, "course.lesson.yourTurn")}
            </span>
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** Phone: horizontal strip of reached moves; the current comment sits below it. */
export function LessonMoveStrip({
  locale,
  frames,
  reachedStep,
  viewStep,
  onSelect,
  showComments = true,
}: {
  locale: SiteLocale;
  frames: LessonFrame[];
  reachedStep: number;
  viewStep: number;
  onSelect: (step: number) => void;
  /** Treinar hides every author comment; only the moves remain. */
  showComments?: boolean;
}) {
  const model = moveListModel(frames, reachedStep, viewStep);
  const currentRef = useKeepInView(viewStep);
  const current = model.entries.find((entry) => entry.current);
  const comment = viewStep === 0 ? model.opening : (current?.comment ?? "");
  return (
    <div data-lesson-move-strip="" className="lg:hidden">
      <div className="flex min-w-0 items-center gap-1 overflow-x-auto border-b border-studio-border-subtle bg-studio-panel px-2 py-1.5">
        {model.entries.map((entry) => (
          <button
            key={entry.step}
            type="button"
            ref={entry.current ? currentRef : undefined}
            data-move-step={entry.step}
            aria-current={entry.current ? "step" : undefined}
            onClick={() => onSelect(entry.step)}
            className={`shrink-0 ${moveClass(entry.current)}`}
          >
            {entry.showNumber ? `${entry.label} ` : ""}
            {entry.san}
          </button>
        ))}
        {model.pending ? (
          <span className="shrink-0 rounded-[5px] bg-studio-hover px-1.5 py-0.5 text-sm font-medium text-studio-accent-text">
            {model.pending.label} {tCourse(locale, "course.lesson.yourTurn")}
          </span>
        ) : null}
      </div>
      {showComments ? (
        <p className="px-4 pt-3 text-body leading-relaxed text-studio-comment">
          {comment || tCourse(locale, "course.lesson.followLine")}
        </p>
      ) : null}
    </div>
  );
}
