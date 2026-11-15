// SIG-1373: pure state behind the lesson study modes. The first pass through a
// line is Aprender (guided); Treinar (the test pass) starts from the summary.
import { MARK_HEX } from "@/src/chess/marks.ts";
import type { LessonFrame } from "../lesson.ts";

export type LessonMode = "learn" | "train";
export type LessonPhase = "playing" | "summary";

/** Treinar hint ladder: 0 none, 1 the piece to move, 2 the full arrow. */
export type LessonHintLevel = 0 | 1 | 2;

export type LessonSession = {
  mode: LessonMode;
  /** Furthest frame reached in this pass; navigation never goes past it. */
  reachedStep: number;
  /** Frame on the board. */
  viewStep: number;
  mistakes: number;
  hintsUsed: number;
  /** Current rung of the Treinar hint ladder. */
  hintLevel: LessonHintLevel;
  phase: LessonPhase;
};

export const INITIAL_LESSON_SESSION: LessonSession = {
  mode: "learn",
  reachedStep: 0,
  viewStep: 0,
  mistakes: 0,
  hintsUsed: 0,
  hintLevel: 0,
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
  /** A student attempt outside the line: counts a mistake, stays put. */
  | { type: "wrong" }
  /** Treinar only: next rung of the hint ladder, counted. */
  | { type: "hint" };

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
        hintLevel: 0,
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
        hintLevel: 0,
        phase: phaseAt(0, last),
      };
    }
    case "view": {
      const last = Math.max(action.lastStep, 0);
      const step = clampStep(action.step, Math.min(state.reachedStep, last));
      // Browsing away from the frontier invalidates the hint for that frame.
      return {
        ...state,
        viewStep: step,
        hintLevel: 0,
        phase: phaseAt(step, last),
      };
    }
    case "advance": {
      const last = Math.max(action.lastStep, 0);
      const step = clampStep(state.reachedStep + 1, last);
      // The next student move starts with no help.
      return {
        ...state,
        reachedStep: step,
        viewStep: step,
        hintLevel: 0,
        phase: phaseAt(step, last),
      };
    }
    case "wrong":
      // The target move did not change, so the ladder (and its highlight) stays.
      return { ...state, mistakes: state.mistakes + 1 };
    case "hint": {
      if (
        state.mode !== "train" ||
        state.phase !== "playing" ||
        state.hintLevel >= 2
      ) {
        return state;
      }
      const hintLevel = (state.hintLevel + 1) as LessonHintLevel;
      return { ...state, hintLevel, hintsUsed: state.hintsUsed + 1 };
    }
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

/** An opponent frame at the frontier plays itself after a pause in both modes. */
export function autoAdvance(
  state: LessonSession,
  frame: LessonFrame | undefined,
): boolean {
  return (
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

/**
 * Squares lit by the first hint: the piece the student has to move. Empty
 * outside Treinar, before the first hint or away from the frontier.
 */
export function hintSquares(
  state: LessonSession,
  frame: LessonFrame | undefined,
): string[] {
  if (
    state.mode !== "train" ||
    state.hintLevel < 1 ||
    !lessonWaiting(state, frame) ||
    !frame?.move
  ) {
    return [];
  }
  return [frame.move.from];
}

/**
 * The arrow of the second hint, from the piece to its destination. Empty
 * outside Treinar or before the ladder's second rung.
 */
export function hintArrows(
  state: LessonSession,
  frame: LessonFrame | undefined,
): LessonGuideArrow[] {
  if (
    state.mode !== "train" ||
    state.hintLevel < 2 ||
    !lessonWaiting(state, frame) ||
    !frame?.move
  ) {
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

export type LessonSummary = {
  /** Moves in the line, all played once the summary is up. */
  moves: number;
  mistakes: number;
  /** Hints taken in this Treinar pass. */
  hints: number;
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
    hints: state.hintsUsed,
    comment: frames[frames.length - 1]?.comment ?? "",
  };
}
