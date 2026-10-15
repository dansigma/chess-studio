import type { GamePhase } from "./phases.ts";
import { playerAccuracy } from "./review-accuracy.ts";
import { countLabels, type ReviewLabel, type ReviewedMove } from "./review.ts";

export type ReviewSide = "w" | "b";

export type ReportRow = ReviewedMove & {
  side: ReviewSide;
  phase: GamePhase;
  /** Only one legal move was available; excluded from accuracy, ACPL and the game rating (like book moves). */
  forced?: boolean;
  /** Volatility weight of this move for accuracy (see review-accuracy); 1 when absent. */
  weight?: number;
};

export type ReportHeaders = Partial<Record<string, string>>;

export const REPORT_PHASES: ReadonlyArray<{ id: GamePhase; name: string }> = [
  { id: "opening", name: "Opening" },
  { id: "middlegame", name: "Middlegame" },
  { id: "endgame", name: "Endgame" },
];

/** Labels listed under "Key moments". */
export const KEY_MOMENT_LABELS: ReadonlySet<ReviewLabel> = new Set(["brilliant", "inaccuracy", "mistake", "miss", "blunder"]);

const LOSS_CAP_CP = 1000;
const ELO_CEILING = 3100;
const ELO_DECAY_PER_ACPL = 0.01;
const ANCHOR_SENSITIVITY = 0.005;
/** Fewer scored moves (book and forced excluded) than this per side and the rating is not shown. */
export const MIN_MOVES_FOR_RATING = 8;

export type GameRating = {
  /** Rounded to the nearest 10, or null when the game is too short / has no scored moves. */
  value: number | null;
  /** True when the estimate was scaled from the player's header rating. */
  anchored: boolean;
};

export type SideReport = {
  name: string;
  /** Header rating, or null when absent. */
  rating: number | null;
  moves: number;
  accuracy: number | null;
  acpl: number | null;
  gameRating: GameRating;
  counts: Record<ReviewLabel, number>;
  phases: Record<GamePhase, number | null>;
};

export type ReviewReport = {
  white: SideReport;
  black: SideReport;
};

export function parseRating(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/** Raw (unanchored) rating estimate from average centipawn loss. */
export function eloFromAcpl(acpl: number): number {
  return ELO_CEILING * Math.exp(-ELO_DECAY_PER_ACPL * acpl);
}

/** The ACPL a player of rating `rating` is expected to produce. */
export function expectedAcpl(rating: number): number {
  return Math.max(0, -100 * Math.log(Math.min(rating, ELO_CEILING) / ELO_CEILING));
}

/** Scales `rating` down when `acpl` is worse than expected for it, up when better. */
export function anchoredRating(rating: number, acpl: number): number {
  return rating * Math.exp(-ANCHOR_SENSITIVITY * (acpl - expectedAcpl(rating)));
}

function scoredRows(rows: ReportRow[]): ReportRow[] {
  return rows.filter((row) => row.label !== "book" && !row.forced);
}

export function averageCpLoss(rows: ReportRow[]): number | null {
  const scored = scoredRows(rows);
  if (scored.length === 0) {
    return null;
  }
  const total = scored.reduce((sum, row) => sum + Math.min(row.lossCp, LOSS_CAP_CP), 0);
  return total / scored.length;
}

export function estimateGameRating(rows: ReportRow[], headerRating: number | null): GameRating {
  const acpl = averageCpLoss(rows);
  if (scoredRows(rows).length < MIN_MOVES_FOR_RATING || acpl == null) {
    return { value: null, anchored: false };
  }
  const anchored = headerRating != null;
  const raw = anchored ? anchoredRating(headerRating, acpl) : eloFromAcpl(acpl);
  return { value: Math.round(Math.min(raw, ELO_CEILING) / 10) * 10, anchored };
}

function buildSide(rows: ReportRow[], name: string, rating: number | null): SideReport {
  const acpl = averageCpLoss(rows);
  // Book and forced moves are excluded from accuracy and tier counts alike; the
  // forced ones still appear in the move list under their label.
  const scored = rows.filter((row) => !row.forced);
  const accuracyOf = (subset: ReportRow[]) =>
    playerAccuracy(scoredRows(subset).map((row) => ({ accuracy: row.accuracy, weight: row.weight })));
  return {
    name,
    rating,
    moves: rows.length,
    accuracy: accuracyOf(rows),
    acpl: acpl == null ? null : Math.round(acpl),
    gameRating: estimateGameRating(rows, rating),
    counts: countLabels(scored.map((row) => row.label)),
    phases: {
      opening: accuracyOf(rows.filter((row) => row.phase === "opening")),
      middlegame: accuracyOf(rows.filter((row) => row.phase === "middlegame")),
      endgame: accuracyOf(rows.filter((row) => row.phase === "endgame")),
    },
  };
}

export function buildReviewReport(rows: ReportRow[], headers: ReportHeaders): ReviewReport {
  return {
    white: buildSide(
      rows.filter((row) => row.side === "w"),
      headers.White || "White",
      parseRating(headers.WhiteElo),
    ),
    black: buildSide(
      rows.filter((row) => row.side === "b"),
      headers.Black || "Black",
      parseRating(headers.BlackElo),
    ),
  };
}

/** Rows to list under "Key moments", in game order. */
export function keyMoments<T extends { label: ReviewLabel | null }>(rows: T[]): T[] {
  return rows.filter((row) => row.label != null && KEY_MOMENT_LABELS.has(row.label));
}
