import type { GameTree, TreeNode } from "@/src/chess/tree";
import type { CourseColor, VariationProgress } from "./types";

export type LessonMove = {
  uci: string;
  san: string;
  from: string;
  to: string;
  student: boolean;
};

export type LessonFrame = {
  fen: string;
  comment: string;
  san: string | null;
  move: LessonMove | null;
};

function sideToMove(fen: string): "w" | "b" {
  return fen.split(/\s+/)[1] === "b" ? "b" : "w";
}

export function lessonFrames(tree: GameTree, student: CourseColor): LessonFrame[] {
  const studentSide = student === "white" ? "w" : "b";
  const frames: LessonFrame[] = [];
  let node: TreeNode | undefined = tree.children[0];
  let fen = tree.startFen;
  let comment = tree.startComment ?? "";
  let san: string | null = null;

  while (true) {
    const move: LessonMove | null = node
      ? {
          uci: node.uci,
          san: node.san,
          from: node.from,
          to: node.to,
          student: sideToMove(fen) === studentSide,
        }
      : null;
    frames.push({ fen, comment, san, move });
    if (!node) {
      break;
    }
    fen = node.fen;
    comment = node.comment || node.commentBefore || "";
    san = node.san;
    node = node.children[0];
  }

  return frames;
}

export function moveMatches(frame: LessonFrame, uci: string): boolean {
  return Boolean(frame.move?.student && frame.move.uci === uci);
}

export function lineProgressLabel(progress: VariationProgress | undefined, frameCount: number): string {
  if (progress?.learned) {
    return "Learned";
  }
  const step = progress?.step ?? 0;
  if (step <= 0) {
    return "Not started";
  }
  if (frameCount > 0) {
    const place = Math.min(step + 1, frameCount);
    return `Continue · ${place} / ${frameCount}`;
  }
  return "Continue";
}

/** Learned sticks once earned, and only a one-step advance onto the last frame earns it. */
export function progressAfterStep(
  current: VariationProgress | undefined,
  step: number,
  nextStep: number,
  frameCount: number,
): VariationProgress {
  const last = Math.max(frameCount - 1, 0);
  const clamped = Math.max(0, Math.min(nextStep, last));
  const already = current?.learned ?? false;
  const learned = already || (clamped === step + 1 && frameCount > 0 && clamped === last);
  return { step: clamped, learned };
}
