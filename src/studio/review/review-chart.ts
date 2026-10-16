// SIG-967: pure chart math + key-moment filter helpers for the review eval
// chart. No React/store imports — unit-tested in review-chart.test.ts.
// Geometry mirrors EvalGraphPanel (PAD_X = 28, PAD_Y = 16, PAWN_CAP = 5).
import type { GamePhase } from "@/src/chess/phases";
import { KEY_MOMENT_LABELS } from "@/src/chess/review-report";
import type { KeyMomentRow } from "./ReviewReportCard";

export const REVIEW_CHART_CAP = 5;
const CHART_PAD_X = 28;
const CHART_PAD_Y = 16;

export type SideFilter = "both" | "w" | "b";
export type TierGroup = "all" | "brilliant" | "mistakes" | "misses" | "blunders";

/** Labels in each tier group (mirrors KEY_MOMENT_LABELS membership). */
export const REVIEW_TIER_GROUPS: Record<Exclude<TierGroup, "all">, readonly string[]> = {
  brilliant: ["brilliant"],
  mistakes: ["inaccuracy", "mistake"],
  misses: ["miss"],
  blunders: ["blunder"],
};

export function clampReviewPawns(pawns: number): number {
  return Math.max(-REVIEW_CHART_CAP, Math.min(REVIEW_CHART_CAP, pawns));
}

export function yAt(pawns: number, height: number, padY: number = CHART_PAD_Y): number {
  const inner = height - padY * 2;
  return padY + ((REVIEW_CHART_CAP - clampReviewPawns(pawns)) / (REVIEW_CHART_CAP * 2)) * inner;
}

export function xAt(index: number, count: number, width: number, padX: number = CHART_PAD_X): number {
  const inner = Math.max(1, width - padX * 2);
  if (count <= 1) {
    return padX + inner / 2;
  }
  return padX + (index / (count - 1)) * inner;
}

/**
 * Ply indexes where the phase changes (vertical separator lines). Uses the
 * row-carried `phase` (authoritative from the engine via phaseAt) — never
 * recomputes dividePhases from FENs.
 */
export function phaseSeparators(rows: Array<{ phase: GamePhase }>): number[] {
  const out: number[] = [];
  for (let index = 1; index < rows.length; index += 1) {
    if (rows[index].phase !== rows[index - 1].phase) {
      out.push(index);
    }
  }
  return out;
}

export type MomentFilter = { side: SideFilter; tierGroup: TierGroup };

/** Narrows key moments by side then tier group; forced/book/null labels never pass. */
export function filterKeyMoments<T extends KeyMomentRow>(moments: T[], filter: MomentFilter): T[] {
  const bySide = filter.side === "both" ? moments : moments.filter((row) => row.side === filter.side);
  if (filter.tierGroup === "all") {
    // Input is normally already keyMoments(), but still exclude forced/book/null
    // so the chart and list can never show a non-key moment.
    return bySide.filter((row) => row.label != null && KEY_MOMENT_LABELS.has(row.label));
  }
  const labels = REVIEW_TIER_GROUPS[filter.tierGroup];
  return bySide.filter((row) => row.label != null && labels.includes(row.label));
}

/** Prev/next positions within the filtered order; null at the ends (no wrap). */
export function prevNextIndices(count: number, current: number | null): { prev: number | null; next: number | null } {
  if (count === 0 || current == null) {
    return { prev: null, next: null };
  }
  return {
    prev: current > 0 ? current - 1 : null,
    next: current < count - 1 ? current + 1 : null,
  };
}
