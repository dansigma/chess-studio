"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Chess, type Square } from "chess.js";
import { Chessboard } from "react-chessboard";
import { ChevronLeft, ChevronRight, ChevronsLeft, ExternalLink } from "lucide-react";
import { importPgn } from "@/src/chess/pgn";
import { boardSquareStyles } from "@/src/chess/board-themes";
import { MARK_HEX } from "@/src/chess/marks";
import { piecesForSet } from "@/src/chess/piece-sets";
import { shareBoardUrl, writeCourseStudyImport } from "@/src/chess/share-board";
import { useStudioStore } from "@/src/store/studio-store";
import { Button, IconButton } from "@/src/studio/ui/Button";
import { lessonFrames, progressAfterStep, studentMoveMatches } from "./lesson";
import { PROGRESS_BROWSER_ONLY, findVariation, loadProgress, saveVariationProgress } from "./store";
import { tCourse } from "@/src/i18n/course-strings";
import { formatInteger } from "@/src/i18n/format";
import { useCourseData } from "./use-courses";
import { useCourseContent } from "./use-course-content";
import { LockedLesson } from "./LockedLesson";
import { CourseChrome } from "./CourseChrome";
import type { Course, CourseChapter, CourseVariation } from "./types";

export function LessonView({ course, variationId }: { course: Course; variationId: string }) {
  const router = useRouter();
  // SIG-1119: the gated lesson payload. Seed/local courses ship full content
  // (contentLoaded undefined) and skip the fetch; outline rows load it here.
  const content = useCourseContent(course);
  const effectiveCourse = useMemo<Course>(
    () =>
      content.status === "ready" && course.contentLoaded === false
        ? { ...course, chapters: content.chapters, contentLoaded: true }
        : course,
    [content, course],
  );
  const [step, setStep] = useState(0);
  const [notice, setNotice] = useState("");
  const [hint, setHint] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [lessonKey, setLessonKey] = useState<string | null>(null);
  const boardTheme = useStudioStore((state) => state.settings.boardTheme);
  const locale = useStudioStore((state) => state.settings.locale);
  const pieceSet = useStudioStore((state) => state.settings.pieceSet);
  const showCoordinates = useStudioStore((state) => state.settings.showCoordinates);
  const { progress: savedProgress, admin, isAdmin, ready: progressReady, signedIn } = useCourseData();

  const loaded: {
    course: Course;
    chapter: CourseChapter;
    variation: CourseVariation;
  } | null = useMemo(() => {
    const found = findVariation(effectiveCourse, variationId);
    return found ? { course: effectiveCourse, chapter: found.chapter, variation: found.variation } : null;
  }, [effectiveCourse, variationId]);
  const currentLessonKey = `${course.slug}/${variationId}`;
  if (lessonKey !== currentLessonKey && progressReady) {
    setLessonKey(currentLessonKey);
    const saved = loaded ? savedProgress[variationId] : undefined;
    setStep(saved?.step ?? 0);
    setHint(false);
    setNotice("");
    setSelected(null);
  }

  const frames = useMemo(() => {
    if (!loaded) {
      return [];
    }
    return lessonFrames(importPgn(loaded.variation.pgn).tree, loaded.course.color);
  }, [loaded]);

  const frame = frames[Math.min(step, Math.max(frames.length - 1, 0))];
  const waiting = Boolean(frame?.move?.student);
  const done = frames.length > 0 && step >= frames.length - 1;
  const studentSide = loaded?.course.color === "white" ? "w" : "b";

  function persist(nextStep: number) {
    const next = progressAfterStep(loadProgress()[variationId], step, nextStep, frames.length);
    setStep(next.step);
    setNotice("");
    setHint(false);
    setSelected(null);
    void saveVariationProgress(variationId, next).then((error) => {
      if (error === PROGRESS_BROWSER_ONLY) {
        setNotice(tCourse(locale, "course.lesson.browserOnlyFallback"));
      } else if (error) {
        setNotice(error);
      }
    });
  }

  function go(nextStep: number) {
    persist(nextStep);
  }

  function playExpected() {
    if (frame?.move && !frame.move.student) {
      go(step + 1);
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

  const actions = useRef({ go, playExpected, step, waiting, done, ready: Boolean(frame) });
  useEffect(() => {
    actions.current = { go, playExpected, step, waiting, done, ready: Boolean(frame) };
  });

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const current = actions.current;
      if (!current.ready) {
        return;
      }
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
      ) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      if (event.key === "Home") {
        event.preventDefault();
        current.go(0);
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        current.go(current.step - 1);
        return;
      }
      if (event.key === "ArrowRight" && !current.waiting && !current.done) {
        event.preventDefault();
        current.playExpected();
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
      return chess.moves({ square: selected as Square, verbose: true }).map((move) => move.to);
    } catch {
      return [] as string[];
    }
  }, [frame, selected, waiting]);

  if (!loaded) {
    return (
      <div className="min-h-full bg-studio-bg">
        <CourseChrome admin={admin} isAdmin={isAdmin} />
        <main className="px-6 py-10 text-studio-muted">{tCourse(locale, "course.lesson.notFound")}</main>
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
          <LockedLesson course={course} lessonPath={`/courses/${course.slug}/${variationId}`} signedIn={signedIn} />
        </div>
      );
    }
    return <div className="min-h-full bg-studio-bg" />;
  }
  if (!frame) {
    return <div className="min-h-full bg-studio-bg" />;
  }

  const theme = boardSquareStyles(boardTheme);
  const pieces = piecesForSet(pieceSet);
  const previous = step > 0 ? frames[step - 1]?.move : null;
  const squareStyles: Record<string, { backgroundColor?: string; backgroundImage?: string; boxShadow?: string }> = {};
  if (previous) {
    squareStyles[previous.from] = { backgroundColor: "rgba(186, 202, 68, 0.72)" };
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
      backgroundImage: "radial-gradient(circle, rgba(0,0,0,0.28) 22%, transparent 23%)",
    };
  }
  const showAnswer = waiting && hint && frame.move;
  const arrows = showAnswer
    ? [{ startSquare: frame.move!.from, endSquare: frame.move!.to, color: MARK_HEX.B }]
    : [];
  const linePercent = frames.length <= 1 ? 100 : Math.round((step / (frames.length - 1)) * 100);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-studio-bg">
      <CourseChrome admin={admin} isAdmin={isAdmin} />
      <div className="shrink-0 border-b border-studio-border bg-studio-chrome px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link href={`/courses/${loaded.course.slug}`} className="text-caption text-studio-muted hover:text-studio-fg">
              {loaded.course.title}
            </Link>
            <h1 className="text-body font-semibold text-studio-fg">
              {loaded.chapter.title} · {loaded.variation.title}
            </h1>
          </div>
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
        </div>
        <div
          className="mt-2 h-1 overflow-hidden rounded-full bg-studio-track"
          role="progressbar"
          aria-valuenow={linePercent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={tCourse(locale, "course.lesson.progressAria")}
        >
          <div className="h-full bg-studio-accent" style={{ width: `${linePercent}%` }} />
        </div>
      </div>
      <div className="mx-auto grid min-h-0 w-full max-w-5xl flex-1 grid-rows-[minmax(0,1fr)_auto] gap-3 px-4 py-3 lg:grid-cols-[minmax(0,520px)_minmax(0,1fr)] lg:grid-rows-1 lg:gap-6 lg:py-6">
        <div className="flex h-full min-h-0 w-full items-center justify-center [container-type:size]">
          <div className="size-[min(100cqw,100cqh,520px)] overflow-hidden rounded-lg shadow-[0_6px_20px_rgb(0_0_0/0.28)] ring-1 ring-studio-border-strong">
            <Chessboard
              key={`${variationId}-${pieceSet}`}
              options={{
                id: `lesson-${variationId}`,
                position: frame.fen,
                boardOrientation: loaded.course.color,
                showNotation: showCoordinates,
                animationDurationInMs: 0,
                showAnimations: false,
                allowDrawingArrows: false,
                clearArrowsOnClick: false,
                clearArrowsOnPositionChange: false,
                arrows,
                lightSquareStyle: theme.light,
                darkSquareStyle: theme.dark,
                squareStyles,
                pieces,
                boardStyle: { width: "100%", height: "100%", borderRadius: 8, overflow: "hidden" },
                canDragPiece: ({ piece }) => {
                  if (!waiting) {
                    return false;
                  }
                  const color = piece.pieceType.startsWith("w") ? "w" : "b";
                  return color === studentSide;
                },
                onPieceDrop: ({ sourceSquare, targetSquare }) => {
                  if (!targetSquare) {
                    return false;
                  }
                  return tryStudentMove(sourceSquare, targetSquare);
                },
                onSquareClick: ({ square, piece }) => {
                  if (!waiting) {
                    return;
                  }
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
                },
              }}
            />
          </div>
        </div>
        <section className="flex max-h-[min(42dvh,280px)] min-h-36 flex-col overflow-hidden rounded-xl border border-studio-border bg-studio-chrome lg:max-h-[calc(100dvh-8rem)] lg:min-h-0 lg:self-start">
          <div className="flex shrink-0 items-center gap-0.5 border-b border-studio-border px-1.5 py-1">
            <IconButton label={tCourse(locale, "course.lesson.transport.start")} shortcut="Home" disabled={step === 0} onClick={() => go(0)}>
              <ChevronsLeft size={15} />
            </IconButton>
            <IconButton label={tCourse(locale, "course.lesson.transport.back")} shortcut="←" disabled={step === 0} onClick={() => go(step - 1)}>
              <ChevronLeft size={15} />
            </IconButton>
            <IconButton label={tCourse(locale, "course.lesson.transport.forward")} shortcut="→" disabled={waiting || done} onClick={playExpected}>
              <ChevronRight size={15} />
            </IconButton>
            <span className="ml-auto px-2 text-caption tabular-nums text-studio-muted">
              {tCourse(locale, "course.lesson.stepCounter", {
                current: formatInteger(locale, step + 1),
                total: formatInteger(locale, frames.length),
              })}
            </span>
          </div>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 text-body leading-relaxed text-studio-fg">
            {frame.san ? (
              <p className="text-caption text-studio-muted">
                {tCourse(locale, "course.lesson.previousMove", { san: frame.san })}
              </p>
            ) : null}
            <p>{frame.comment || tCourse(locale, "course.lesson.followLine")}</p>
            {waiting && !hint ? (
              <p className="font-medium text-studio-accent-text">{tCourse(locale, "course.lesson.yourTurn")}</p>
            ) : null}
            {showAnswer ? (
              <p className="font-medium text-studio-accent-text">
                {tCourse(locale, "course.lesson.yourMove", { san: frame.move?.san ?? "" })}
              </p>
            ) : null}
            {notice ? (
              <p role="alert" className="rounded-lg bg-studio-warning-bg px-3 py-2 text-studio-warning-fg">
                {notice}
              </p>
            ) : null}
            {done ? (
              <p className="rounded-lg bg-studio-hover px-3 py-2 text-studio-success">
                {tCourse(locale, "course.lesson.complete")}
              </p>
            ) : null}
          </div>
          <div className="shrink-0 border-t border-studio-border p-3">
            {waiting ? (
              <p className="text-caption text-studio-muted">
                {hint ? tCourse(locale, "course.lesson.hintShown") : tCourse(locale, "course.lesson.hintHidden")}
              </p>
            ) : done ? (
              <Link href={`/courses/${loaded.course.slug}`} className="text-body font-medium text-studio-accent-text">
                {tCourse(locale, "course.lesson.backToCourse")}
              </Link>
            ) : (
              <Button variant="primary" onClick={playExpected}>
                {tCourse(locale, "course.lesson.next")}
              </Button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
