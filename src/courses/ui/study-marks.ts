import { arrowsForRender, MARK_FILL, type BoardMarks } from "../../chess/marks.ts";

export type StudyArrow = { startSquare: string; endSquare: string; color: string };
export type StudySquareStyles = Record<
  string,
  { backgroundColor?: string; backgroundImage?: string; boxShadow?: string }
>;

/** Author arrows first, the given (hint) arrows last so they draw on top; a duplicate of a given arrow is dropped. */
export function mergeStudyArrows(marks: BoardMarks | undefined, arrows: StudyArrow[]): StudyArrow[] {
  const authored = arrowsForRender(marks?.arrows ?? []).filter(
    (a) => !arrows.some((g) => g.startSquare === a.startSquare && g.endSquare === a.endSquare),
  );
  return [...authored, ...arrows];
}

/** Author square fills sit under the given styles: last-move/selection/destination styles win on the same property. */
export function mergeStudySquareStyles(
  marks: BoardMarks | undefined,
  squareStyles: StudySquareStyles,
): StudySquareStyles {
  if (!marks?.squares.length) {
    return squareStyles;
  }
  const merged: StudySquareStyles = {};
  for (const mark of marks.squares) {
    merged[mark.square] = { backgroundColor: MARK_FILL[mark.color] };
  }
  for (const [square, style] of Object.entries(squareStyles)) {
    merged[square] = { ...merged[square], ...style };
  }
  return merged;
}
