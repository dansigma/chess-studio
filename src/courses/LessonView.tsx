"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Chess, type Square } from "chess.js";
import { ExternalLink } from "lucide-react";
import { importPgn } from "@/src/chess/pgn";
import { MARK_HEX } from "@/src/chess/marks";
import { shareBoardUrl, writeCourseStudyImport } from "@/src/chess/share-board";
import { useStudioStore } from "@/src/store/studio-store";
import { Button } from "@/src/studio/ui/Button";
import { Skeleton } from "@/src/site/ui/Skeleton";
import { afterFirstLearn } from "./review";
import { lessonFrames, progressAfterStep, studentMoveMatches } from "./lesson.ts";
import {
  PROGRESS_BROWSER_ONLY,
  findVariation,
  loadProgress,
  saveVariationProgress,
} from "./store";
import { recordEnrollment } from "./enrollment";
import { createBrowserSupabase } from "@/src/lib/supabase/client";
import { tCourse } from "@/src/i18n/course-strings";
import { formatInteger } from "@/src/i18n/format";
import { useCourseData } from "./use-courses";
import { useCourseContent } from "./use-course-content";
import { LockedLesson } from "./LockedLesson";
import { CourseChrome } from "./CourseChrome";
import { StudyBoard } from "./ui/StudyBoard";
import { LessonHeader } from "./lesson/LessonHeader";
import { StudyLayout } from "./lesson/StudyLayout";
import { StudyTransport } from "./lesson/StudyTransport";
import { ShortcutsDialog } from "./lesson/ShortcutsDialog";
import { LessonMoveList, LessonMoveStrip } from "./lesson/LessonMoveList";
import { clampViewStep } from "./lesson/move-list.ts";
import {
  chapterSegments,
  lastReachedStep,
  lessonShortcut,
} from "./lesson/model";
import type { Course, CourseChapter, CourseVariation } from "./types";

export function LessonView({
  course,
  variationId,
}: {
  course: Course;
  variationId: string;
}) {
  const router = useRouter();
  // SIG-1119: the gated lesson payload. Seed/local courses ship full content
  // (contentLoaded undefined) and skip the fetch; outline rows load it here.
  const [attempt, setAttempt] = useState(0);
  const content = useCourseContent(course, attempt);
  const effectiveCourse = useMemo<Course>(
    () =>
      content.status === "ready" && course.contentLoaded === false
        ? { ...course, chapters: content.chapters, contentLoaded: true }
        : course,
    [content, course],
  );
  // `step` is saved progress (the frontier); `view` is the frame on the board.
  // Browsing back only moves `view` and never saves.
  const [step, setStep] = useState(0);
  const [view, setView] = useState(0);
  const [notice, setNotice] = useState("");
  const [hint, setHint] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  // Furthest step reached in this lesson: where "end" jumps to.
  const [reached, setReached] = useState(0);
  const [lessonKey, setLessonKey] = useState<string | null>(null);
  const locale = useStudioStore((state) => state.settings.locale);
  const {
    progress: savedProgress,
    admin,
    isAdmin,
    ready: progressReady,
    signedIn,
    userId,
  } = useCourseData();

  const loaded: {
    course: Course;
    chapter: CourseChapter;
    variation: CourseVariation;
  } | null = useMemo(() => {
    const found = findVariation(effectiveCourse, variationId);
    return found
      ? {
          course: effectiveCourse,
          chapter: found.chapter,
          variation: found.variation,
        }
      : null;
  }, [effectiveCourse, variationId]);
  const currentLessonKey = `${course.slug}/${variationId}`;
  if (lessonKey !== currentLessonKey && progressReady) {
    setLessonKey(currentLessonKey);
    const saved = loaded ? savedProgress[variationId] : undefined;
    setStep(saved?.step ?? 0);
    setView(saved?.step ?? 0);
    setReached(saved?.step ?? 0);
    setFlipped(false);
    setShowShortcuts(false);
    setHint(false);
    setNotice("");
    setSelected(null);
  }

  const frames = useMemo(() => {
    if (!loaded) {
      return [];
    }
    return lessonFrames(
      importPgn(loaded.variation.pgn).tree,
      loaded.course.color,
    );
  }, [loaded]);

  const lastStep = Math.max(frames.length - 1, 0);
  const learnedNow = Boolean(loaded && savedProgress[variationId]?.learned);
  const reachedStep = lastReachedStep(
    Math.max(reached, step),
    learnedNow,
    frames.length,
  );
  const frame = frames[Math.min(view, lastStep)];
  const waiting = Boolean(frame?.move?.student) && view === step;
  const done = frames.length > 0 && view >= lastStep;
  const studentSide = loaded?.course.color === "white" ? "w" : "b";

  // SIG-1052: first open per signed-in user and course, only when the lesson
  // content is actually readable. Seed/local courses ship full content
  // (contentLoaded undefined) and record normally; gated rows record once the
  // fetch resolves to ready. Locked/loading/error lessons record nothing.
  const contentReadable =
    course.contentLoaded !== false || content.status === "ready";
  useEffect(() => {
    if (!signedIn || !userId || course.builtin || !contentReadable) {
      return;
    }
    const supabase = createBrowserSupabase();
    if (!supabase) {
      return;
    }
    void recordEnrollment(supabase, userId, course.id);
  }, [signedIn, userId, course.builtin, course.id, contentReadable]);

  function persist(nextStep: number) {
    const current = loadProgress()[variationId];
    let next = progressAfterStep(current, step, nextStep, frames.length);
    if (next.learned && !current?.learned) {
      next = afterFirstLearn(next, new Date());
    }
    setStep(next.step);
    setView(next.step);
    setReached((value) => Math.max(value, next.step));
    setNotice("");
    setHint(false);
    setSelected(null);
    void saveVariationProgress(variationId, next, effectiveCourse).then(
      (error) => {
        if (error === PROGRESS_BROWSER_ONLY) {
          setNotice(tCourse(locale, "course.lesson.browserOnlyFallback"));
        } else if (error) {
          setNotice(error);
        }
      },
    );
  }

  // Navigation only: never persists, never reveals frames past the reached one.
  function go(nextStep: number) {
    setView(clampViewStep(nextStep, reachedStep));
    setNotice("");
    setHint(false);
    setSelected(null);
  }

  function playExpected() {
    if (view < reachedStep) {
      go(view + 1);
      return;
    }
    if (frame?.move && !frame.move.student) {
      persist(step + 1);
    }
  }

  function tryStudentMove(from: string, to: string): boolean {
    if (!frame?.move?.student || from === to) {
      return false;
    }
    if (!studentMoveMatches(frame, from, to)) {
      setNotice(tCourse(locale, "course.lesson.notInLine"));
      setHint(true);
      setSelected(null);
      return false;
    }
    persist(step + 1);
    return true;
  }

  const endStep = reachedStep;
  const actions = useRef({
    go,
    playExpected,
    step: view,
    waiting,
    done,
    endStep,
    ready: Boolean(frame),
    dialogOpen: false,
  });
  useEffect(() => {
    actions.current = {
      go,
      playExpected,
      step: view,
      waiting,
      done,
      endStep,
      ready: Boolean(frame),
      dialogOpen: showShortcuts,
    };
  });

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const current = actions.current;
      if (!current.ready) {
        return;
      }
      const action = lessonShortcut(event, { dialogOpen: current.dialogOpen });
      if (!action) {
        return;
      }
      event.preventDefault();
      if (action === "start") {
        current.go(0);
      } else if (action === "back") {
        current.go(current.step - 1);
      } else if (action === "forward") {
        if (!current.waiting && !current.done) {
          current.playExpected();
        }
      } else if (action === "end") {
        if (current.endStep > current.step) {
          current.go(current.endStep);
        }
      } else if (action === "flip") {
        setFlipped((value) => !value);
      } else {
        setShowShortcuts(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const dests = useMemo(() => {
    if (!selected || !frame || !waiting) {
      return [] as string[];
    }
    try {
      const chess = new Chess(frame.fen);
      return chess
        .moves({ square: selected as Square, verbose: true })
        .map((move) => move.to);
    } catch {
      return [] as string[];
    }
  }, [frame, selected, waiting]);

  if (!loaded) {
    return (
      <div className="min-h-full bg-studio-bg">
        <CourseChrome admin={admin} isAdmin={isAdmin} />
        <main className="px-6 py-10 text-studio-muted">
          {tCourse(locale, "course.lesson.notFound")}
        </main>
      </div>
    );
  }
  // SIG-1119: the database refused course_content (or the fetch is still in
  // flight / failed): no PGN is available, so show the outline + next step
  // instead of the board. Seed/local courses always resolve ready above.
  if (course.contentLoaded === false && content.status !== "ready") {
    if (content.status === "locked") {
      return (
        <div className="min-h-full bg-studio-bg">
          <CourseChrome admin={admin} isAdmin={isAdmin} />
          <LockedLesson course={course} />
        </div>
      );
    }
    return (
      <div className="min-h-full bg-studio-bg">
        <CourseChrome admin={admin} isAdmin={isAdmin} />
        {content.status === "error" ? (
          <main className="mx-auto max-w-5xl px-4 py-10" role="alert">
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
        ) : (
          <LessonSkeleton
            label={tCourse(locale, "course.lesson.loadingAria")}
          />
        )}
      </div>
    );
  }
  if (!frame) {
    return (
      <div className="min-h-full bg-studio-bg">
        <CourseChrome admin={admin} isAdmin={isAdmin} />
        <LessonSkeleton label={tCourse(locale, "course.lesson.loadingAria")} />
      </div>
    );
  }

  const previous = view > 0 ? frames[view - 1]?.move : null;
  const squareStyles: Record<
    string,
    { backgroundColor?: string; backgroundImage?: string; boxShadow?: string }
  > = {};
  if (previous) {
    squareStyles[previous.from] = {
      backgroundColor: "rgba(186, 202, 68, 0.72)",
    };
    squareStyles[previous.to] = { backgroundColor: "rgba(186, 202, 68, 0.72)" };
  }
  if (selected) {
    squareStyles[selected] = {
      ...(squareStyles[selected] ?? {}),
      boxShadow: "inset 0 0 0 3px rgba(255, 255, 255, 0.55)",
    };
  }
  for (const square of dests) {
    squareStyles[square] = {
      ...(squareStyles[square] ?? {}),
      backgroundImage:
        "radial-gradient(circle, rgba(0,0,0,0.28) 22%, transparent 23%)",
    };
  }
  const showAnswer = waiting && hint && frame.move;
  const arrows = showAnswer
    ? [
        {
          startSquare: frame.move!.from,
          endSquare: frame.move!.to,
          color: MARK_HEX.B,
        },
      ]
    : [];
  const orientation =
    (loaded.course.color === "white") !== flipped ? "white" : "black";
  const segments = chapterSegments(loaded.chapter, savedProgress, variationId);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-studio-bg">
      <CourseChrome admin={admin} isAdmin={isAdmin} />
      <LessonHeader
        locale={locale}
        courseSlug={loaded.course.slug}
        courseTitle={loaded.course.title}
        chapterTitle={loaded.chapter.title}
        lineTitle={loaded.variation.title}
        segments={segments}
        progress={savedProgress}
        actions={
          <Button
            variant="secondary"
            size="sm"
            className="mt-0.5 shrink-0"
            onClick={() => {
              const title = `${loaded.course.title} — ${loaded.variation.title}`;
              const written = writeCourseStudyImport({
                title,
                pgn: loaded.variation.pgn,
                atFen: frame.fen,
              });
              if (written) {
                router.push("/studio");
              } else {
                router.push(shareBoardUrl(window.location.origin, frame.fen));
              }
            }}
          >
            <ExternalLink size={14} aria-hidden />
            {tCourse(locale, "course.lesson.openInStudio")}
          </Button>
        }
      />
      <StudyLayout
        locale={locale}
        videoUrl={loaded.chapter.videoUrl}
        videoTitle={loaded.chapter.title}
        board={
          <StudyBoard
            id={`lesson-${variationId}`}
            fen={frame.fen}
            orientation={orientation}
            arrows={arrows}
            squareStyles={squareStyles}
            interactive={waiting}
            canDragPiece={({ piece }) =>
              (piece.pieceType.startsWith("w") ? "w" : "b") === studentSide
            }
            onMove={tryStudentMove}
            onSquareClick={({ square, piece }) => {
              if (selected && dests.includes(square)) {
                tryStudentMove(selected, square);
                return;
              }
              if (piece) {
                const color = piece.pieceType.startsWith("w") ? "w" : "b";
                if (color === studentSide) {
                  setSelected(square);
                  return;
                }
              }
              setSelected(null);
            }}
          />
        }
        controls={
          <>
            <StudyTransport
              locale={locale}
              atStart={view === 0}
              canForward={!waiting && !done}
              canEnd={endStep > view}
              onStart={() => go(0)}
              onBack={() => go(view - 1)}
              onForward={playExpected}
              onEnd={() => go(endStep)}
              onFlip={() => setFlipped((value) => !value)}
              onHelp={() => setShowShortcuts(true)}
            />
            <span className="ml-auto px-2 text-caption tabular-nums text-studio-muted">
              {tCourse(locale, "course.lesson.stepCounter", {
                current: formatInteger(locale, view + 1),
                total: formatInteger(locale, frames.length),
              })}
            </span>
          </>
        }
      >
        <LessonMoveList
          locale={locale}
          frames={frames}
          reachedStep={reachedStep}
          viewStep={view}
          onSelect={go}
        />
        <LessonMoveStrip
          locale={locale}
          frames={frames}
          reachedStep={reachedStep}
          viewStep={view}
          onSelect={go}
        />
        <div className="space-y-3 p-4 text-body leading-relaxed text-studio-fg">
          {waiting && !hint ? (
            <p className="font-medium text-studio-accent-text lg:hidden">
              {tCourse(locale, "course.lesson.yourTurn")}
            </p>
          ) : null}
          {showAnswer ? (
            <p className="font-medium text-studio-accent-text">
              {tCourse(locale, "course.lesson.yourMove", {
                san: frame.move?.san ?? "",
              })}
            </p>
          ) : null}
          {notice ? (
            <p
              role="alert"
              className="rounded-lg bg-studio-warning-bg px-3 py-2 text-studio-warning-fg"
            >
              {notice}
            </p>
          ) : null}
          {done ? (
            <p className="rounded-lg bg-studio-hover px-3 py-2 text-studio-success">
              {tCourse(locale, "course.lesson.complete")}
            </p>
          ) : null}
        </div>
        <div className="border-t border-studio-border p-3">
          {waiting ? (
            <p className="text-caption text-studio-muted">
              {hint
                ? tCourse(locale, "course.lesson.hintShown")
                : tCourse(locale, "course.lesson.hintHidden")}
            </p>
          ) : done ? (
            <Link
              href={`/courses/${loaded.course.slug}`}
              className="text-body font-medium text-studio-accent-text"
            >
              {tCourse(locale, "course.lesson.backToCourse")}
            </Link>
          ) : (
            <Button variant="primary" onClick={playExpected}>
              {tCourse(locale, "course.lesson.next")}
            </Button>
          )}
        </div>
      </StudyLayout>
      {showShortcuts ? (
        <ShortcutsDialog
          locale={locale}
          onClose={() => setShowShortcuts(false)}
        />
      ) : null}
    </div>
  );
}

function LessonSkeleton({ label }: { label: string }) {
  return (
    <main
      role="status"
      aria-label={label}
      className="mx-auto grid max-w-5xl gap-6 px-4 py-6 lg:grid-cols-[minmax(0,520px)_minmax(0,1fr)]"
    >
      <Skeleton className="aspect-square w-full" />
      <div className="space-y-3">
        <Skeleton className="w-2/3" />
        <Skeleton lines={4} />
      </div>
    </main>
  );
}
