"use client";

import { useMemo, useState } from "react";
import { tCourse } from "@/src/i18n/course-strings";
import type { SiteLocale } from "@/src/i18n/locale";
import { Skeleton } from "@/src/site/ui/Skeleton";
import { Button } from "@/src/studio/ui/Button";
import { useStudioStore } from "@/src/store/studio-store";
import { chapterIndex } from "../chapter-param";
import { CourseChrome } from "../CourseChrome";
import { LockedLesson } from "../LockedLesson";
import { nextStudyLine, type NextStudyLine } from "../next-line";
import { afterReview } from "../review";
import { dueQueue, type DueLine } from "../review-queue";
import {
  PROGRESS_BROWSER_ONLY,
  loadProgress,
  saveVariationProgress,
} from "../store";
import type { Course } from "../types";
import { useCourseContent } from "../use-course-content";
import { useCourseData } from "../use-courses";
import { ReviewLine } from "./ReviewLine";
import { ReviewEmptyState, ReviewHeader, ReviewSummary } from "./ReviewPanels";
import {
  INITIAL_REVIEW_SESSION,
  reviewSessionReducer,
  type ReviewLineResult,
} from "./review-session";

/**
 * SIG-1375: a review session plays every line of the course that is due now,
 * most overdue first, in Treinar mode. Chapter cards add `?capitulo=N`, which
 * limits the session to that chapter. Each finished line is saved right away,
 * so leaving midway keeps the reviews already done; the queue itself is frozen
 * when the session opens, because saving a line makes it not due anymore.
 */
export function ReviewSession({
  course,
  chapterParam,
}: {
  course: Course;
  /** Raw `?capitulo=` value, read by the server page. */
  chapterParam?: string;
}) {
  const locale = useStudioStore((state) => state.settings.locale);
  const [attempt, setAttempt] = useState(0);
  const content = useCourseContent(course, attempt);
  const effectiveCourse = useMemo<Course>(
    () =>
      content.status === "ready" && course.contentLoaded === false
        ? { ...course, chapters: content.chapters, contentLoaded: true }
        : course,
    [content, course],
  );
  const { progress, admin, isAdmin, ready } = useCourseData();

  // `?capitulo=N` is 1-based among the chapters that have lines, the same
  // numbering the chapter grid uses.
  const shownChapters = useMemo(
    () =>
      effectiveCourse.chapters.filter(
        (chapter) => chapter.variations.length > 0,
      ),
    [effectiveCourse],
  );
  const chapterPosition = chapterIndex(chapterParam, shownChapters.length);
  const chapterId =
    chapterPosition === null
      ? undefined
      : shownChapters[chapterPosition]?.id;

  const contentReady =
    course.contentLoaded !== false || content.status === "ready";
  const [queue, setQueue] = useState<DueLine[] | null>(null);
  const [queuedFor, setQueuedFor] = useState<string | null>(null);
  // SIG-1386: frozen with the queue. Reviews only touch learned lines, so
  // the session never changes which line is next.
  const [nextLine, setNextLine] = useState<NextStudyLine | null>(null);
  const [review, setReview] = useState(INITIAL_REVIEW_SESSION);
  const [notice, setNotice] = useState("");
  const queueKey = `${course.slug}#${chapterId ?? ""}`;
  if (ready && contentReady && queuedFor !== queueKey) {
    setQueuedFor(queueKey);
    // A due line without PGN cannot be played (an outline whose content never
    // arrived); it must not turn into an empty result in the summary.
    setQueue(
      dueQueue(effectiveCourse, progress, new Date(), chapterId).filter(
        (line) => line.variation.pgn.trim() !== "",
      ),
    );
    setNextLine(nextStudyLine(effectiveCourse, progress, chapterId));
    setReview(INITIAL_REVIEW_SESSION);
    setNotice("");
  }

  if (!ready || !contentReady) {
    if (course.contentLoaded === false && content.status === "locked") {
      return (
        <div className="min-h-full bg-studio-bg">
          <CourseChrome admin={admin} isAdmin={isAdmin} />
          <LockedLesson course={course} />
        </div>
      );
    }
    if (course.contentLoaded === false && content.status === "error") {
      return (
        <div className="min-h-full bg-studio-bg">
          <CourseChrome admin={admin} isAdmin={isAdmin} />
          <main role="alert" className="mx-auto max-w-5xl px-4 py-10">
            <p className="text-body text-studio-fg">
              {tCourse(locale, "course.lesson.loadError")}
            </p>
            <Button
              className="mt-3"
              variant="secondary"
              onClick={() => setAttempt((value) => value + 1)}
            >
              {tCourse(locale, "course.error.retry")}
            </Button>
          </main>
        </div>
      );
    }
    return (
      <ReviewSkeleton locale={locale} admin={admin} isAdmin={isAdmin} />
    );
  }

  if (!queue) {
    return <ReviewSkeleton locale={locale} admin={admin} isAdmin={isAdmin} />;
  }
  if (queue.length === 0) {
    return (
      <div className="min-h-full bg-studio-bg">
        <CourseChrome admin={admin} isAdmin={isAdmin} />
        <ReviewEmptyState
          locale={locale}
          courseSlug={course.slug}
          nextLine={nextLine}
        />
      </div>
    );
  }

  const total = queue.length;
  const current = queue[Math.min(review.index, total - 1)];
  const summary = review.phase === "summary";

  function finishLine(line: DueLine, mistakes: number) {
    const saved = loadProgress()[line.variation.id] ?? {
      step: 0,
      learned: true,
    };
    const next = afterReview(saved, { correct: mistakes === 0 }, new Date());
    const result: ReviewLineResult = {
      variationId: line.variation.id,
      title: line.variation.title,
      chapterTitle: line.chapterTitle,
      mistakes,
      dueAt: next.reviewDueAt ?? new Date().toISOString(),
    };
    setReview((state) =>
      reviewSessionReducer(state, {
        type: "finish",
        result,
        total,
      }),
    );
    // Save as the line ends, not when Continuar is pressed: leaving midway
    // keeps every completed review.
    void saveVariationProgress(line.variation.id, next, effectiveCourse).then(
      (error) => {
        if (error === PROGRESS_BROWSER_ONLY) {
          setNotice(tCourse(locale, "course.lesson.browserOnlyFallback"));
        } else if (error) {
          setNotice(error);
        }
      },
    );
  }

  function continueSession() {
    setReview((state) =>
      reviewSessionReducer(state, { type: "next", total }),
    );
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-studio-bg">
      <CourseChrome admin={admin} isAdmin={isAdmin} />
      <ReviewHeader
        locale={locale}
        courseSlug={course.slug}
        courseTitle={course.title}
        lineTitle={summary ? undefined : current.variation.title}
        chapterTitle={summary ? undefined : current.chapterTitle}
        position={summary ? total : review.index + 1}
        total={total}
        completed={review.results.length}
      />
      {notice ? (
        <p
          role="alert"
          className="border-b border-studio-border bg-studio-chrome px-4 py-2 text-center text-caption text-studio-warning-fg"
        >
          {notice}
        </p>
      ) : null}
      {summary ? (
        <ReviewSummary
          locale={locale}
          courseSlug={course.slug}
          nextLine={nextLine}
          results={review.results}
        />
      ) : (
        <ReviewLine
          key={current.variation.id}
          locale={locale}
          course={effectiveCourse}
          line={current}
          onFinish={(result) => finishLine(current, result.mistakes)}
          onContinue={continueSession}
        />
      )}
    </div>
  );
}

function ReviewSkeleton({
  locale,
  admin,
  isAdmin,
}: {
  locale: SiteLocale;
  admin: boolean;
  isAdmin: boolean;
}) {
  return (
    <div className="min-h-full bg-studio-bg">
      <CourseChrome admin={admin} isAdmin={isAdmin} />
      <main
        role="status"
        aria-label={tCourse(locale, "course.lesson.loadingAria")}
        className="mx-auto grid max-w-5xl gap-6 px-4 py-6 lg:grid-cols-[minmax(0,520px)_minmax(0,1fr)]"
      >
        <Skeleton className="aspect-square w-full" />
        <div className="space-y-3">
          <Skeleton className="w-2/3" />
          <Skeleton lines={4} />
        </div>
      </main>
    </div>
  );
}
