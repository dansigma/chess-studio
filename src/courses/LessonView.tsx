"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Chess, type Square } from "chess.js";
import { ExternalLink } from "lucide-react";
import { importPgn } from "@/src/chess/pgn";
import { MARK_FILL } from "@/src/chess/marks";
import { shareBoardUrl, writeCourseStudyImport } from "@/src/chess/share-board";
import { useStudioStore } from "@/src/store/studio-store";
import { Button } from "@/src/studio/ui/Button";
import { Skeleton } from "@/src/site/ui/Skeleton";
import { afterFirstLearn, afterTrain } from "./review";
import { nextLineHref } from "./next-line";
import {
  lessonFrames,
  planMarks,
  progressAfterStep,
  studentMoveMatches,
} from "./lesson.ts";
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
import { LessonSummaryPanel } from "./lesson/LessonSummary";
import { chapterSegments, lessonShortcut } from "./lesson/model";
import {
  INITIAL_LESSON_SESSION,
  autoAdvance,
  guideArrows,
  guideComment,
  hintArrows,
  hintSquares,
  lessonOpenStep,
  lessonSessionReducer,
  lessonSummary,
  lessonWaiting,
  type LessonMode,
  type LessonSession,
} from "./lesson/session.ts";
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
  // SIG-1373: one reducer for the guided pass (Aprender) and the test pass
  // (Treinar). Browsing back only moves the view and never saves progress.
  const [session, setSession] = useState<LessonSession>(INITIAL_LESSON_SESSION);
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [lessonKey, setLessonKey] = useState<string | null>(null);
  // SIG-1374: lines learned in Aprender during this page visit keep the
  // first-completion review path even after the progress hook goes stale.
  const learnedInSession = useRef<Set<string>>(new Set());
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
  const currentLessonKey = `${course.slug}/${variationId}`;
  if (lessonKey !== currentLessonKey && progressReady && loaded) {
    setLessonKey(currentLessonKey);
    const mode = lessonModeFromUrl();
    setSession(
      lessonSessionReducer(INITIAL_LESSON_SESSION, {
        type: "open",
        mode,
        step: lessonOpenStep(mode, savedProgress[variationId], lastStep),
        lastStep,
      }),
    );
    setFlipped(false);
    setShowShortcuts(false);
    setNotice("");
    setSelected(null);
  }

  const frame = frames[Math.min(session.viewStep, lastStep)];
  const waiting = lessonWaiting(session, frame);
  const finished = session.phase === "summary";
  const summary = lessonSummary(session, frames);
  const studentSide = loaded?.course.color === "white" ? "w" : "b";
  // SIG-1374: Treinar continues along the course order; the course page is
  // both the after-the-last-line target and the "Curso concluído" label.
  const nextHref = loaded ? nextLineHref(loaded.course, variationId) : "";
  const courseHref = loaded ? `/courses/${loaded.course.slug}` : "";
  const atCourseEnd = nextHref === courseHref;

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
    let next = progressAfterStep(
      current,
      session.reachedStep,
      nextStep,
      frames.length,
    );
    if (next.learned && !current?.learned) {
      next = afterFirstLearn(next, new Date());
      learnedInSession.current.add(currentLessonKey);
    }
    // SIG-1374: the last Treinar move also writes the review rung in the same
    // upsert, so the schedule can never race the step save. A clean first pass
    // enters at level 1; a mistake keeps it at level 0, due in 4 h.
    if (session.mode === "train" && nextStep >= lastStep) {
      next = afterTrain(
        next,
        {
          mistakes: session.mistakes,
          learnedThisSession: learnedInSession.current.has(currentLessonKey),
        },
        new Date(),
      );
    }
    setSession((state) =>
      lessonSessionReducer(state, { type: "advance", lastStep }),
    );
    setNotice("");
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
    setSession((state) =>
      lessonSessionReducer(state, { type: "view", step: nextStep, lastStep }),
    );
    setNotice("");
    setSelected(null);
  }

  function playExpected() {
    if (session.viewStep < session.reachedStep) {
      go(session.viewStep + 1);
      return;
    }
    if (frame?.move && !frame.move.student) {
      persist(session.reachedStep + 1);
    }
  }

  function tryStudentMove(from: string, to: string): boolean {
    if (!frame?.move?.student || from === to) {
      return false;
    }
    if (!studentMoveMatches(frame, from, to)) {
      setSession((state) =>
        lessonSessionReducer(state, { type: "wrong" }),
      );
      setNotice(
        tCourse(
          locale,
          session.mode === "train"
            ? "course.lesson.tryAgain"
            : "course.lesson.notInLine",
        ),
      );
      setSelected(null);
      // The board rejects the move and keeps the student on the same frame.
      return false;
    }
    persist(session.reachedStep + 1);
    return true;
  }

  function revealHint() {
    setSession((state) => lessonSessionReducer(state, { type: "hint" }));
  }

  // Refazer starts the same mode again; Continuar para Revisão starts
  // Treinar. The address keeps the mode, so a reload resumes it.
  function startMode(mode: LessonMode) {
    setSession((state) =>
      lessonSessionReducer(state, { type: "start", mode, lastStep }),
    );
    setNotice("");
    setSelected(null);
    syncModeUrl(mode);
  }

  const endStep = session.reachedStep;
  const actions = useRef({
    go,
    playExpected,
    startTrain: () => startMode("train"),
    step: session.viewStep,
    waiting,
    done: finished,
    mode: session.mode,
    nextHref,
    endStep,
    ready: Boolean(frame),
    dialogOpen: false,
  });
  useEffect(() => {
    actions.current = {
      go,
      playExpected,
      startTrain: () => startMode("train"),
      step: session.viewStep,
      waiting,
      done: finished,
      mode: session.mode,
      nextHref,
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
      // Space / Enter only act as the summary's primary button; while playing
      // they keep their normal browser behaviour.
      if (action === "primary" && !current.done) {
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
      } else if (action === "primary") {
        if (current.mode === "train") {
          router.push(current.nextHref);
        } else {
          current.startTrain();
        }
      } else {
        setShowShortcuts(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  // SIG-1373: the opponent answers by itself after a short pause. SIG-1374
  // keeps that rule in Treinar, where only the student's own moves wait.
  // Reduced motion means no pause animation: advance right away.
  const shouldAutoAdvance =
    lessonKey === currentLessonKey &&
    progressReady &&
    autoAdvance(session, frame);
  useEffect(() => {
    if (!shouldAutoAdvance) {
      return;
    }
    const reduced =
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
    const timer = window.setTimeout(
      () => actions.current.playExpected(),
      reduced ? 0 : 500,
    );
    return () => window.clearTimeout(timer);
  }, [shouldAutoAdvance, session.viewStep, session.reachedStep]);

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

  const previous =
    session.viewStep > 0 ? frames[session.viewStep - 1]?.move : null;
  const squareStyles: Record<
    string,
    { backgroundColor?: string; backgroundImage?: string; boxShadow?: string }
  > = {};
  // Treinar hides every guide while playing; only the hint ladder may light
  // a square, and the plan comes back on the summary.
  if (previous && session.mode === "learn") {
    squareStyles[previous.from] = {
      backgroundColor: "rgba(186, 202, 68, 0.72)",
    };
    squareStyles[previous.to] = { backgroundColor: "rgba(186, 202, 68, 0.72)" };
  }
  for (const square of hintSquares(session, frame)) {
    squareStyles[square] = {
      ...(squareStyles[square] ?? {}),
      backgroundColor: MARK_FILL.B,
    };
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
  // Aprender's blue guide arrow and Treinar's second hint never overlap.
  const arrows = [...guideArrows(session, frame), ...hintArrows(session, frame)];
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
        mode={session.mode}
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
            marks={
              finished
                ? planMarks(frames)
                : session.mode === "learn"
                  ? frame.marks
                  : undefined
            }
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
              atStart={session.viewStep === 0}
              canForward={!waiting && !finished}
              canEnd={endStep > session.viewStep}
              onStart={() => go(0)}
              onBack={() => go(session.viewStep - 1)}
              onForward={playExpected}
              onEnd={() => go(endStep)}
              onFlip={() => setFlipped((value) => !value)}
              onHelp={() => setShowShortcuts(true)}
            />
            <span className="ml-auto px-2 text-caption tabular-nums text-studio-muted">
              {tCourse(locale, "course.lesson.stepCounter", {
                current: formatInteger(locale, session.viewStep + 1),
                total: formatInteger(locale, frames.length),
              })}
            </span>
          </>
        }
        footer={
          summary ? (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                className="max-sm:h-11"
                onClick={() => startMode(session.mode)}
              >
                {tCourse(locale, "course.lesson.summary.restart")}
              </Button>
              {session.mode === "train" ? (
                <Link
                  href={nextHref}
                  data-lesson-next
                  data-course-end={atCourseEnd ? "true" : undefined}
                  className="inline-flex h-8 items-center justify-center rounded-lg bg-studio-accent px-3.5 text-body font-medium text-studio-accent-fg hover:bg-studio-accent-strong max-sm:h-11"
                >
                  {tCourse(
                    locale,
                    atCourseEnd
                      ? "course.lesson.summary.courseDone"
                      : "course.lesson.summary.next",
                  )}
                </Link>
              ) : (
                <Button
                  variant="primary"
                  className="max-sm:h-11"
                  onClick={() => startMode("train")}
                >
                  {tCourse(locale, "course.lesson.summary.review")}
                </Button>
              )}
            </div>
          ) : waiting ? (
            session.mode === "train" ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  className="max-sm:h-11"
                  data-lesson-hint
                  data-hint-level={session.hintLevel}
                  disabled={session.hintLevel >= 2}
                  onClick={revealHint}
                >
                  {tCourse(locale, "course.lesson.hint")}
                </Button>
                <span className="text-caption text-studio-muted">
                  {tCourse(
                    locale,
                    session.hintLevel === 0
                      ? "course.lesson.hintHidden"
                      : "course.lesson.hintShown",
                  )}
                </span>
              </div>
            ) : (
              <p className="text-caption text-studio-muted">
                {tCourse(locale, "course.lesson.hintShown")}
              </p>
            )
          ) : finished ? (
            <Link
              href={`/courses/${loaded.course.slug}`}
              className="text-body font-medium text-studio-accent-text"
            >
              {tCourse(locale, "course.lesson.backToCourse")}
            </Link>
          ) : (
            <Button
              variant="primary"
              className="max-sm:h-11"
              onClick={playExpected}
            >
              {tCourse(locale, "course.lesson.next")}
            </Button>
          )
        }
      >
        <LessonMoveList
          locale={locale}
          frames={frames}
          reachedStep={session.reachedStep}
          viewStep={session.viewStep}
          onSelect={go}
          showComments={session.mode === "learn"}
        />
        <LessonMoveStrip
          locale={locale}
          frames={frames}
          reachedStep={session.reachedStep}
          viewStep={session.viewStep}
          onSelect={go}
          showComments={session.mode === "learn"}
        />
        <div className="space-y-3 p-4 text-body leading-relaxed text-studio-fg">
          {waiting && session.mode === "learn" ? (
            <p data-lesson-guide className="text-studio-comment">
              {guideComment(frames, session.viewStep) ||
                tCourse(locale, "course.lesson.hintShown")}
            </p>
          ) : null}
          {waiting && session.mode === "train" && session.hintLevel === 0 ? (
            <p className="font-medium text-studio-accent-text lg:hidden">
              {tCourse(locale, "course.lesson.yourTurn")}
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
          {summary ? (
            <LessonSummaryPanel
              locale={locale}
              moves={summary.moves}
              mistakes={summary.mistakes}
              hints={
                session.mode === "train" ? summary.hints : undefined
              }
              comment={summary.comment}
            />
          ) : null}
          {finished && !summary ? (
            <p className="rounded-lg bg-studio-hover px-3 py-2 text-studio-success">
              {tCourse(locale, "course.lesson.complete")}
            </p>
          ) : null}
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

/** SIG-1373: `?modo=treinar` resumes the test pass after a reload. */
function lessonModeFromUrl(): LessonMode {
  if (typeof window === "undefined") {
    return "learn";
  }
  const modo = new URLSearchParams(window.location.search).get("modo");
  return modo === "treinar" ? "train" : "learn";
}

/** Keep the mode in the address without a navigation or a server round trip. */
function syncModeUrl(mode: LessonMode) {
  if (typeof window === "undefined") {
    return;
  }
  const url = new URL(window.location.href);
  if (mode === "train") {
    url.searchParams.set("modo", "treinar");
  } else {
    url.searchParams.delete("modo");
  }
  window.history.replaceState(
    window.history.state,
    "",
    `${url.pathname}${url.search}${url.hash}`,
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
