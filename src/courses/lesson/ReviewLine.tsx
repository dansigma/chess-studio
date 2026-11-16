"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Chess, type Square } from "chess.js";
import { MARK_FILL } from "@/src/chess/marks";
import { importPgn } from "@/src/chess/pgn";
import { tCourse } from "@/src/i18n/course-strings";
import { formatInteger } from "@/src/i18n/format";
import type { SiteLocale } from "@/src/i18n/locale";
import { Button } from "@/src/studio/ui/Button";
import { lessonFrames, planMarks, studentMoveMatches } from "../lesson.ts";
import type { DueLine } from "../review-queue";
import type { Course } from "../types";
import { StudyBoard } from "../ui/StudyBoard";
import { LessonMoveList, LessonMoveStrip } from "./LessonMoveList";
import { lessonShortcut } from "./model";
import { reviewResultText } from "./review-session";
import { ShortcutsDialog } from "./ShortcutsDialog";
import { StudyLayout } from "./StudyLayout";
import { StudyTransport } from "./StudyTransport";
import {
  INITIAL_LESSON_SESSION,
  autoAdvance,
  hintArrows,
  hintSquares,
  lessonSessionReducer,
  lessonWaiting,
  type LessonSession,
} from "./session.ts";

/**
 * SIG-1375: one line of the review session, always in Treinar mode. The
 * student plays their moves; the opponent answers by itself. Finishing shows
 * the short result ("Sem erros" / "N erros") and Continuar (Space) moves the
 * session on. Progress is reported once, so the parent can save it as soon as
 * the line ends.
 */
export function ReviewLine({
  locale,
  course,
  line,
  onFinish,
  onContinue,
}: {
  locale: SiteLocale;
  course: Course;
  line: DueLine;
  onFinish: (result: { mistakes: number }) => void;
  onContinue: () => void;
}) {
  const frames = useMemo(
    () => lessonFrames(importPgn(line.variation.pgn).tree, course.color),
    [line.variation.pgn, course.color],
  );
  const lastStep = Math.max(frames.length - 1, 0);
  const [session, setSession] = useState<LessonSession>(() =>
    lessonSessionReducer(INITIAL_LESSON_SESSION, {
      type: "start",
      mode: "train",
      lastStep,
    }),
  );
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);

  const frame = frames[Math.min(session.viewStep, lastStep)];
  const waiting = lessonWaiting(session, frame);
  const finished = session.phase === "summary";
  const studentSide = course.color === "white" ? "w" : "b";

  function advance() {
    setSession((state) =>
      lessonSessionReducer(state, { type: "advance", lastStep }),
    );
    setNotice("");
    setSelected(null);
  }

  function go(step: number) {
    setSession((state) =>
      lessonSessionReducer(state, { type: "view", step, lastStep }),
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
      advance();
    }
  }

  function tryStudentMove(from: string, to: string): boolean {
    if (!frame?.move?.student || from === to) {
      return false;
    }
    if (!studentMoveMatches(frame, from, to)) {
      setSession((state) => lessonSessionReducer(state, { type: "wrong" }));
      setNotice(tCourse(locale, "course.lesson.tryAgain"));
      setSelected(null);
      return false;
    }
    advance();
    return true;
  }

  // The opponent answers after a short pause, as in the lesson (reduced motion
  // means no pause at all).
  const actions = useRef({ playExpected });
  useEffect(() => {
    actions.current = { playExpected };
  });
  const shouldAutoAdvance = autoAdvance(session, frame);
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

  // Report the line once, when the last frame is reached. The guard keeps a
  // re-render (or StrictMode's double effect) from saving the same line twice.
  const reported = useRef(false);
  useEffect(() => {
    if (!finished || reported.current) {
      return;
    }
    reported.current = true;
    onFinish({ mistakes: session.mistakes });
  }, [finished, onFinish, session.mistakes]);

  // Space / Enter press Continuar once the line's result is up.
  useEffect(() => {
    if (!finished) {
      return;
    }
    function onKey(event: KeyboardEvent) {
      if (showShortcuts || lessonShortcut(event) !== "primary") {
        return;
      }
      event.preventDefault();
      onContinue();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [finished, onContinue, showShortcuts]);

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

  const squareStyles: Record<
    string,
    { backgroundColor?: string; backgroundImage?: string; boxShadow?: string }
  > = {};
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
  const arrows = hintArrows(session, frame);
  const orientation =
    (course.color === "white") !== flipped ? "white" : "black";

  return (
    <>
      <StudyLayout
        locale={locale}
        videoUrl={undefined}
        videoTitle={line.chapterTitle}
        board={
          <StudyBoard
            id={`review-${line.variation.id}`}
            fen={frame.fen}
            orientation={orientation}
            arrows={arrows}
            marks={finished ? planMarks(frames) : undefined}
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
              canEnd={session.reachedStep > session.viewStep}
              onStart={() => go(0)}
              onBack={() => go(session.viewStep - 1)}
              onForward={playExpected}
              onEnd={() => go(session.reachedStep)}
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
          finished ? (
            <Button
              variant="primary"
              className="max-sm:h-11"
              onClick={onContinue}
            >
              {tCourse(locale, "course.review.continue")}
            </Button>
          ) : waiting ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                className="max-sm:h-11"
                disabled={session.hintLevel >= 2}
                onClick={() =>
                  setSession((state) =>
                    lessonSessionReducer(state, { type: "hint" }),
                  )
                }
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
          showComments={false}
        />
        <LessonMoveStrip
          locale={locale}
          frames={frames}
          reachedStep={session.reachedStep}
          viewStep={session.viewStep}
          onSelect={go}
          showComments={false}
        />
        <div className="space-y-3 p-4 text-body leading-relaxed text-studio-fg">
          {waiting && session.hintLevel === 0 ? (
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
          {finished ? (
            <div data-review-result aria-live="polite" className="space-y-1">
              <h2 className="text-body font-semibold text-studio-fg">
                {tCourse(locale, "course.review.result.heading")}
              </h2>
              <p
                className={`tabular-nums ${
                  session.mistakes === 0
                    ? "text-studio-success"
                    : "text-studio-warning-fg"
                }`}
              >
                {reviewResultText(locale, session.mistakes)}
              </p>
            </div>
          ) : null}
        </div>
      </StudyLayout>
      {showShortcuts ? (
        <ShortcutsDialog
          locale={locale}
          onClose={() => setShowShortcuts(false)}
        />
      ) : null}
    </>
  );
}
