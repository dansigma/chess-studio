// SIG-1373: pure state behind the lesson study modes. The first pass through a
// line is Aprender (guided); Treinar (the test pass) starts from the summary.
import { MARK_HEX } from "@/src/chess/marks.ts";
import type { LessonFrame } from "../lesson.ts";

export type LessonMode = "learn" | "train";
export type LessonPhase = "playing" | "summary";

export type LessonSession = {
  mode: LessonMode;
  /** Furthest frame reached in this pass; navigation never goes past it. */
  reachedStep: number;
  /** Frame on the board. */
  viewStep: number;
  mistakes: number;
  hintsUsed: number;
  phase: LessonPhase;
};

export const INITIAL_LESSON_SESSION: LessonSession = {
  mode: "learn",
  reachedStep: 0,
  viewStep: 0,
  mistakes: 0,
  hintsUsed: 0,
  phase: "playing",
};

export type LessonSessionAction =
  /** Load a line: mode from the address, frontier from saved progress. */
  | { type: "open"; mode: LessonMode; step: number; lastStep: number }
  /** Start a mode from the first move (Refazer, Continuar para Revisão). */
  | { type: "start"; mode: LessonMode; lastStep: number }
  /** Browse without touching progress or mistakes. */
  | { type: "view"; step: number; lastStep: number }
  /** One frame forward: a correct student move or an auto-played opponent move. */
  | { type: "advance"; lastStep: number }
  | { type: "wrong" };

function clampStep(step: number, lastStep: number): number {
  return Math.max(0, Math.min(step, Math.max(lastStep, 0)));
}

/** The last frame is the line's end, including a one-frame line. */
function phaseAt(step: number, lastStep: number): LessonPhase {
  return step >= Math.max(lastStep, 0) ? "summary" : "playing";
}

/**
 * Frontier a line opens on. Treinar always starts from the first move (also
 * after a reload with ?modo=treinar). Aprender opens a learned line on its
 * plan + summary and otherwise resumes at the saved frontier.
 */
export function lessonOpenStep(
  mode: LessonMode,
  saved: { step: number; learned: boolean } | undefined,
  lastStep: number,
): number {
  if (mode === "train") {
    return 0;
  }
  if (saved?.learned) {
    return Math.max(lastStep, 0);
  }
  return clampStep(saved?.step ?? 0, lastStep);
}

export function lessonSessionReducer(
  state: LessonSession,
  action: LessonSessionAction,
): LessonSession {
  switch (action.type) {
    case "open": {
      const last = Math.max(action.lastStep, 0);
      const step = clampStep(action.step, last);
      return {
        mode: action.mode,
        reachedStep: step,
        viewStep: step,
        mistakes: 0,
        hintsUsed: 0,
        phase: phaseAt(step, last),
      };
    }
    case "start": {
      const last = Math.max(action.lastStep, 0);
      return {
        mode: action.mode,
        reachedStep: 0,
        viewStep: 0,
        mistakes: 0,
        hintsUsed: 0,
        phase: phaseAt(0, last),
      };
    }
    case "view": {
      const last = Math.max(action.lastStep, 0);
      const step = clampStep(action.step, Math.min(state.reachedStep, last));
      return { ...state, viewStep: step, phase: phaseAt(step, last) };
    }
    case "advance": {
      const last = Math.max(action.lastStep, 0);
      const step = clampStep(state.reachedStep + 1, last);
      return { ...state, reachedStep: step, viewStep: step, phase: phaseAt(step, last) };
    }
    case "wrong":
      return { ...state, mistakes: state.mistakes + 1 };
  }
}

/** The student is on the frontier and it is their move. */
export function lessonWaiting(
  state: LessonSession,
  frame: LessonFrame | undefined,
): boolean {
  return (
    state.phase === "playing" &&
    Boolean(frame?.move?.student) &&
    state.viewStep === state.reachedStep
  );
}

/** In Aprender, an opponent frame at the frontier plays itself after a pause. */
export function autoAdvance(
  state: LessonSession,
  frame: LessonFrame | undefined,
): boolean {
  return (
    state.mode === "learn" &&
    state.phase === "playing" &&
    state.viewStep === state.reachedStep &&
    Boolean(frame?.move) &&
    !frame?.move?.student
  );
}

export type LessonGuideArrow = {
  startSquare: string;
  endSquare: string;
  color: string;
};

/** The blue guide arrow of the move to play; only while the student is waiting. */
export function guideArrows(
  state: LessonSession,
  frame: LessonFrame | undefined,
): LessonGuideArrow[] {
  if (state.mode !== "learn" || !lessonWaiting(state, frame) || !frame?.move) {
    return [];
  }
  return [
    {
      startSquare: frame.move.from,
      endSquare: frame.move.to,
      color: MARK_HEX.B,
    },
  ];
}

/** The author's explanation of the move the student is about to play. */
export function guideComment(frames: LessonFrame[], step: number): string {
  return frames[step + 1]?.comment ?? "";
}

export type LessonSummary = {
  /** Moves in the line, all played once the summary is up. */
  moves: number;
  mistakes: number;
  /** The last author comment: the strategic plan. */
  comment: string;
};

export function lessonSummary(
  state: LessonSession,
  frames: LessonFrame[],
): LessonSummary | null {
  if (state.phase !== "summary") {
    return null;
  }
  return {
    moves: Math.max(frames.length - 1, 0),
    mistakes: state.mistakes,
    comment: frames[frames.length - 1]?.comment ?? "",
  };
}
