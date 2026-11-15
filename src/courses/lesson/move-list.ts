// SIG-1371: pure model behind the lesson move list, driven by lesson frames.
import { stripMarkTokens } from "@/src/chess/marks";
import type { LessonFrame } from "../lesson.ts";

export type MoveListEntry = {
  /** Frame index reached by this move (>= 1). */
  step: number;
  san: string;
  color: "w" | "b";
  /** "1." for White, "1…" for Black. */
  label: string;
  /** White always shows its number; Black only first or after a comment. */
  showNumber: boolean;
  /** Author comment with [%cal]/[%csl] tokens stripped. */
  comment: string;
  current: boolean;
};

export type MoveListModel = {
  opening: string;
  entries: MoveListEntry[];
  /** The move the student still has to play (never revealing its SAN). */
  pending: { label: string; color: "w" | "b" } | null;
};

function parseFen(fen: string): { color: "w" | "b"; fullmove: number } {
  const parts = fen.split(/\s+/);
  const fullmove = Number.parseInt(parts[5] ?? "1", 10);
  return {
    color: parts[1] === "b" ? "b" : "w",
    fullmove: Number.isFinite(fullmove) && fullmove > 0 ? fullmove : 1,
  };
}

function labelFor(color: "w" | "b", fullmove: number): string {
  return color === "w" ? `${fullmove}.` : `${fullmove}…`;
}

/** Clamp a requested view to the frames the student has reached. */
export function clampViewStep(target: number, reached: number): number {
  return Math.max(0, Math.min(target, Math.max(reached, 0)));
}

export function moveListModel(
  frames: LessonFrame[],
  reached: number,
  view: number,
): MoveListModel {
  const last = Math.max(frames.length - 1, 0);
  const limit = Math.max(0, Math.min(reached, last));
  const entries: MoveListEntry[] = [];
  for (let i = 1; i <= limit; i++) {
    const frame = frames[i];
    const before = parseFen(frames[i - 1].fen);
    const previousComment = i > 1 ? stripMarkTokens(frames[i - 1].comment) : "";
    entries.push({
      step: i,
      san: frame.san ?? "",
      color: before.color,
      label: labelFor(before.color, before.fullmove),
      showNumber: before.color === "w" || i === 1 || previousComment !== "",
      comment: stripMarkTokens(frame.comment),
      current: i === view,
    });
  }
  const at = frames[limit];
  let pending: MoveListModel["pending"] = null;
  if (at?.move?.student && limit < last) {
    const parsed = parseFen(at.fen);
    pending = { label: labelFor(parsed.color, parsed.fullmove), color: parsed.color };
  }
  return {
    opening: frames[0] ? stripMarkTokens(frames[0].comment) : "",
    entries,
    pending,
  };
}
