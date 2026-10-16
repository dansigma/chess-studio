// SIG-968: pure review-to-annotation model. Builds per-node NAG / eval-tag /
// best-was edits from graded review rows; tree application stays in the
// store (bulk-apply + undo snapshot). No React/store imports here — the
// best-move SAN goes through lineToSan, which owns the chess.js contact.
import type { SiteLocale } from "../i18n/locale.ts";
import { lineToSan } from "./explain/gather.ts";
import { KEY_MOMENT_LABELS } from "./review-report.ts";
import { tReview } from "./review-strings.ts";
import type { ReviewLabel } from "./review.ts";
import type { Path } from "./tree.ts";

/** First line of every review-written comment block; re-annotate strips from here. */
export const REVIEW_ANNOTATION_SENTINEL = "[Chess Studio review]";

/** Scores at or beyond this are mate markers (cf. REVIEW_MATE_PAWNS); no mate distance rides in ReviewRow. */
const MATE_PAWNS = 900;
/** Mate markers render at the chart cap (cf. REVIEW_CHART_CAP), never "900.00". */
const MATE_RENDER_PAWNS = 5;

/** Review NAG per tier; tiers absent here (miss, book, forced, …) write comment only. */
const REVIEW_NAG_BY_LABEL: Partial<Record<ReviewLabel, number>> = {
  brilliant: 3,
  great: 1,
  inaccuracy: 6,
  mistake: 2,
  blunder: 4,
};

/** Move-group NAGs; a review NAG replaces only these, preserving position/other NAGs on the node. */
const MOVE_GROUP_NAGS = new Set([1, 2, 3, 4, 5, 6]);

/** Labels that earn a "Best was …" note. */
const BEST_WAS_LABELS: ReadonlySet<ReviewLabel> = new Set(["miss", "mistake", "blunder"]);

export type ReviewAnnotationRow = {
  path: Path;
  label: ReviewLabel | null;
  /** White-perspective pawns after the move; written verbatim, never mover-flipped. */
  afterPawns: number;
  /** Engine continuation from the position before the move, best move first (UCI). */
  bestPv: string[];
  playedUci: string;
  fenBefore: string;
  /** Existing node comment; user text before the sentinel survives re-annotate. */
  comment?: string;
  /** Existing node NAGs; only the move-group entry is ever replaced. */
  nags?: number[];
};

export type ReviewAnnotationOptions = {
  evals: boolean;
  bestMove: boolean;
  keyMomentsOnly: boolean;
};

export type ReviewAnnotationEdit = {
  path: Path;
  nags?: number[] | undefined;
  comment?: string | undefined;
};

function withReviewNag(nags: number[] | undefined, nag: number): number[] {
  return [...(nags ?? []).filter((item) => !MOVE_GROUP_NAGS.has(item)), nag].sort((a, b) => a - b);
}

function sameNumbers(a: number[] | undefined, b: number[]): boolean {
  const left = [...(a ?? [])].sort((x, y) => x - y);
  return left.length === b.length && left.every((value, index) => value === b[index]);
}

/** User text is everything before a prior review block; empty when the node has no comment. */
function userTextBefore(comment: string | undefined): string {
  if (!comment) {
    return "";
  }
  const index = comment.indexOf(REVIEW_ANNOTATION_SENTINEL);
  return (index < 0 ? comment : comment.slice(0, index)).trim();
}

/** "[%eval 0.52]" — two decimals, White POV; mate markers clamp to the chart cap. */
function formatEvalTag(afterPawns: number): string {
  const capped =
    Math.abs(afterPawns) >= MATE_PAWNS ? Math.sign(afterPawns) * MATE_RENDER_PAWNS : afterPawns;
  const fixed = capped.toFixed(2);
  return `[%eval ${fixed === "-0.00" ? "0.00" : fixed}]`;
}

function render(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [key, value] of Object.entries(vars)) {
    out = out.replace(`{${key}}`, value);
  }
  return out;
}

/** SAN of the engine's best move, or null when unknown, illegal, or already played. */
function bestWasSan(row: ReviewAnnotationRow): string | null {
  const bestUci = row.bestPv[0];
  if (!bestUci || bestUci === row.playedUci) {
    return null;
  }
  try {
    return lineToSan(row.fenBefore, [bestUci])[0]?.san ?? null;
  } catch {
    return null;
  }
}

/**
 * Pure per-node edits for the reviewed line. Emits an edit only when the
 * node would change, so re-annotating with the same rows and options is a
 * no-op. Never touches nodes outside `rows`.
 */
export function buildReviewAnnotations(
  locale: SiteLocale,
  rows: ReviewAnnotationRow[],
  options: ReviewAnnotationOptions,
): ReviewAnnotationEdit[] {
  const edits: ReviewAnnotationEdit[] = [];
  for (const row of rows) {
    if (options.keyMomentsOnly && (row.label == null || !KEY_MOMENT_LABELS.has(row.label))) {
      continue;
    }
    const edit: ReviewAnnotationEdit = { path: row.path };
    let changed = false;

    const nag = row.label != null ? (REVIEW_NAG_BY_LABEL[row.label] ?? null) : null;
    if (nag != null) {
      const next = withReviewNag(row.nags, nag);
      if (!sameNumbers(row.nags, next)) {
        edit.nags = next;
        changed = true;
      }
    }

    const lines = [REVIEW_ANNOTATION_SENTINEL];
    if (options.evals) {
      lines.push(formatEvalTag(row.afterPawns));
    }
    if (options.bestMove && row.label != null && BEST_WAS_LABELS.has(row.label)) {
      const san = bestWasSan(row);
      if (san) {
        lines.push(render(tReview(locale, "annotate.bestWas"), { san }));
      }
    }
    const userText = userTextBefore(row.comment);
    const nextComment =
      lines.length > 1
        ? userText
          ? `${userText}\n\n${lines.join("\n")}`
          : lines.join("\n")
        : userText || undefined;
    if ((nextComment ?? "") !== (row.comment?.trim() ?? "")) {
      edit.comment = nextComment;
      changed = true;
    }

    if (changed) {
      edits.push(edit);
    }
  }
  return edits;
}
