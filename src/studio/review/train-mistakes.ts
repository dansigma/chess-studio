// SIG-1206: pure model for the "train these mistakes" banner in the Game
// Review panel. No React, no store: the hook feeds it and the component
// renders it.
import type { MistakeExercise } from "../../chess/mistake-exercises.ts";
import type { ReviewSide } from "../../chess/review-report.ts";
import { fenKey } from "../../chess/tree.ts";
import { tMistakes } from "../../i18n/mistakes-strings.ts";
import type { SiteLocale } from "../../i18n/locale.ts";
import { formatInteger } from "../../i18n/format.ts";

/** Real route of the "My mistakes" trainer (Dashboard card, SIG-1097). */
export const MISTAKES_TRAINER_HREF = "/puzzles/play?mode=mistakes";

export type TrainBanner = { count: number; side: ReviewSide };

/** Exercise side to move, from the FEN (the user's side moves at the mistake). */
function sideToMove(fen: string): ReviewSide | null {
  const field = fen.split(" ")[1];
  return field === "w" || field === "b" ? field : null;
}

/**
 * Due exercises that belong to this game: the exercise key is
 * `mx:${fenKey(fen)}` of the position before the mistaken move, so a game's
 * exercises are exactly the due ones whose key matches one of its positions
 * with the reviewed side to move.
 */
export function dueGameExerciseCount(
  due: MistakeExercise[],
  fens: string[],
  side: ReviewSide,
): number {
  const keys = new Set(fens.map((fen) => `mx:${fenKey(fen)}`));
  return due.filter((exercise) => keys.has(exercise.key) && sideToMove(exercise.fen) === side).length;
}

/**
 * Fresh review: the count of exercises new to the store (null when none).
 * Cached review: this game's exercises that are still due (null when none).
 */
export function trainBannerFor(input: {
  fresh: boolean;
  capture: { added: number; side: ReviewSide } | null;
  userSide: ReviewSide;
  fens: string[];
  due: MistakeExercise[];
}): TrainBanner | null {
  if (input.fresh) {
    return input.capture && input.capture.added > 0
      ? { count: input.capture.added, side: input.capture.side }
      : null;
  }
  const count = dueGameExerciseCount(input.due, input.fens, input.userSide);
  return count > 0 ? { count, side: input.userSide } : null;
}

/** Whole-sentence banner text with the plural form picked by count. */
export function trainBannerText(locale: SiteLocale, banner: TrainBanner): string {
  return tMistakes(
    locale,
    banner.count === 1 ? "mistakes.banner.one" : "mistakes.banner.other",
    {
      count: formatInteger(locale, banner.count),
      side: tMistakes(locale, banner.side === "w" ? "mistakes.banner.side.w" : "mistakes.banner.side.b"),
    },
  );
}
