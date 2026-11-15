// SIG-1375: pure state of the review session. Each line is played in Treinar
// mode; finishing one shows a short result, and only "Continuar" moves on, so
// the summary can list every line's result and next due date.
import { tCourse } from "@/src/i18n/course-strings";
import { formatInteger } from "@/src/i18n/format";
import type { SiteLocale } from "@/src/i18n/locale";

export type ReviewLineResult = {
  variationId: string;
  title: string;
  chapterTitle: string;
  mistakes: number;
  /** ISO time the line is next due after this review. */
  dueAt: string;
};

export type ReviewSessionPhase = "line" | "result" | "summary";

export type ReviewSessionState = {
  /** 0-based position of the line on the board. */
  index: number;
  phase: ReviewSessionPhase;
  results: ReviewLineResult[];
};

export const INITIAL_REVIEW_SESSION: ReviewSessionState = {
  index: 0,
  phase: "line",
  results: [],
};

export type ReviewSessionAction =
  | { type: "finish"; result: ReviewLineResult; total: number }
  | { type: "next"; total: number };

/**
 * finish → the short result of the line just played. next → the next line, or
 * the summary once the last line's result has been continued.
 */
export function reviewSessionReducer(
  state: ReviewSessionState,
  action: ReviewSessionAction,
): ReviewSessionState {
  switch (action.type) {
    case "finish":
      return {
        ...state,
        phase: "result",
        results: [...state.results, action.result],
      };
    case "next": {
      if (state.phase !== "result") {
        return state;
      }
      const total = Math.max(action.total, 0);
      return state.index + 1 >= total
        ? { ...state, phase: "summary" }
        : { ...state, index: state.index + 1, phase: "line" };
    }
  }
}

/** "Sem erros" / "N erros" for one reviewed line. */
export function reviewResultText(locale: SiteLocale, mistakes: number): string {
  if (mistakes <= 0) {
    return tCourse(locale, "course.review.result.clean");
  }
  return tCourse(
    locale,
    mistakes === 1
      ? "course.review.result.mistakes.one"
      : "course.review.result.mistakes.other",
    { count: formatInteger(locale, mistakes) },
  );
}
