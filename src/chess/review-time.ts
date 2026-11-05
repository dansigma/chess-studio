// SIG-1220: time metrics for Game Review. Pure functions over the reviewed rows
// plus the clocks kept on import (`TreeNode.clockMs`, SIG-1218) and the
// `TimeControl` header. Nothing here touches React, the tree or the engine.
import type { GamePhase } from "./phases.ts";
import type { ReviewLabel } from "./review.ts";

export type Side = "w" | "b";

export type TimeControl = {
  /** Starting time of each player, in ms. */
  baseMs: number;
  /** Increment added after every move, in ms. */
  incrementMs: number;
};

/**
 * Parses a PGN `TimeControl` header. Supported: `600`, `180+2` (seconds) and
 * multi-stage FIDE forms such as `40/5400+30:1800+30`, of which only the FIRST
 * stage is used (its base and increment are applied to the whole game; a later
 * stage that adds time is not modelled, so the first move after the time
 * control would show a longer think than it was). `-`, `?`, empty/missing and
 * daily forms `1/86400` (moves per period, no running base) mean "no clocks".
 */
export function parseTimeControl(value: string | undefined | null): TimeControl | null {
  const raw = value?.trim();
  if (!raw || raw === "-" || raw === "?") {
    return null;
  }
  const firstStage = raw.split(":")[0];
  // `moves/seconds` is a stage with a move quota. `1/86400` is a daily game; a
  // quota stage (`40/5400+30`) is a real first stage of an over-the-board control.
  const match = firstStage.match(/^(?:(\d+)\/)?(\d+(?:\.\d+)?)(?:\+(\d+(?:\.\d+)?))?$/);
  if (!match) {
    return null;
  }
  const quota = match[1] === undefined ? null : Number(match[1]);
  const seconds = Number(match[2]);
  const increment = match[3] === undefined ? 0 : Number(match[3]);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return null;
  }
  // Daily / correspondence: one move per period (`1/86400`), no running clock.
  if (quota === 1) {
    return null;
  }
  return { baseMs: Math.round(seconds * 1000), incrementMs: Math.round(increment * 1000) };
}

/** Minimum share of the reviewed moves that must carry a clock for the time metrics to be computed. */
export const MIN_CLOCK_COVERAGE = 0.9;

/** A move played in this time or less, increment included, counts as a premove. */
export const PREMOVE_MAX_MS = 100;

export type TimedMove = {
  side: Side;
  /** Time left for the mover after this move (ms); absent when the node has no clock. */
  clockMs?: number;
};

/**
 * Time spent on every move of a line, in ms (null when it cannot be known).
 * spent = previous clock of the same side - this clock + increment, where the
 * previous clock of a side's first move is the starting time. A move whose
 * previous clock is missing, or that has no clock itself, is null. Negative
 * results (clock quirks, lag compensation) are clamped to 0.
 */
export function timeSpentPerMove(moves: ReadonlyArray<TimedMove>, control: TimeControl): Array<number | null> {
  const previous: Record<Side, number | undefined> = { w: control.baseMs, b: control.baseMs };
  return moves.map((move) => {
    const before = previous[move.side];
    previous[move.side] = move.clockMs;
    if (move.clockMs === undefined || before === undefined) {
      return null;
    }
    return Math.max(0, before - move.clockMs + control.incrementMs);
  });
}

/** Share (0-1) of moves with a clock; 0 for an empty line. */
export function clockCoverage(moves: ReadonlyArray<TimedMove>): number {
  if (moves.length === 0) {
    return 0;
  }
  return moves.filter((move) => move.clockMs !== undefined).length / moves.length;
}

/** Tiers whose time counts toward "accurate" / "inaccurate" averages. Book and Forced are in neither. */
export const ACCURATE_LABELS: ReadonlySet<ReviewLabel> = new Set(["brilliant", "great", "best", "veryGood", "decent"]);
export const INACCURATE_LABELS: ReadonlySet<ReviewLabel> = new Set(["inaccuracy", "mistake", "miss", "blunder"]);

/**
 * Pace (0-3 stars) weights. Pace starts at `maxStars` and loses stars for the
 * three habits below; the result is clamped to 0..maxStars and rounded to half
 * stars. These are a first, deliberately simple model and will be tuned.
 */
export const PACE_WEIGHTS = {
  maxStars: 3,
  /** Sides with fewer timed moves than this get no Pace (too little to judge). */
  minTimedMoves: 5,
  /** Book time: share of the side's total time spent on book moves at which the penalty is full. */
  bookShareForFullPenalty: 0.25,
  /** Stars lost when `bookShareForFullPenalty` (or more) of the time went on book moves; scales linearly below. */
  bookMaxPenalty: 0.75,
  /** A move is "critical" when its volatility weight (review-accuracy `volatilityWeights`, range 0.5-12) is at least this. */
  criticalVolatility: 5,
  /** A critical move is "fast" when it took less than this fraction of the side's average time per move. */
  fastFractionOfAverage: 0.5,
  /** Stars lost when every critical move was fast; scales with the share of critical moves that were. */
  rushedMaxPenalty: 1.5,
  /** The game is decisive when the last evaluation is at least this many pawns from equal (mate counts). */
  decisivePawns: 3,
  /** "Almost no time left": clock after the side's last move below max(lowTimeFloorMs, lowTimeFractionOfBase * base). */
  lowTimeFloorMs: 5000,
  lowTimeFractionOfBase: 0.03,
  /** Stars lost for finishing a decisive game that low on time. */
  lowTimePenalty: 0.75,
} as const;

export type TimeRow = {
  side: Side;
  phase: GamePhase;
  label: ReviewLabel | null;
  forced?: boolean;
  /** Volatility weight of the move (ReportRow.weight); 1 when absent. */
  weight?: number;
  /** White-perspective evaluation after the move, in pawns. */
  afterPawns: number;
  clockMs?: number;
};

export type LongestThink = {
  /** Index of the move in the reviewed rows. */
  index: number;
  label: ReviewLabel | null;
  ms: number;
};

export type PaceBreakdown = {
  bookPenalty: number;
  rushedPenalty: number;
  lowTimePenalty: number;
};

export type SideTime = {
  /** Moves of this side with a known time. */
  timedMoves: number;
  totalMs: number;
  avgMs: number | null;
  avgAccurateMs: number | null;
  avgInaccurateMs: number | null;
  accurateMoves: number;
  inaccurateMoves: number;
  longest: LongestThink | null;
  premoves: number;
  /** Share (0-100) of the side's total time spent in each phase; null when the side has no time at all or never reached the phase. */
  phaseShare: Record<GamePhase, number | null>;
  /** 0-3 in half steps; null when the side has too few timed moves. */
  pace: number | null;
  paceBreakdown: PaceBreakdown | null;
};

export type TimeReport = {
  control: TimeControl | null;
  /** Time spent per row, aligned with the input rows; null when unknown. */
  spentMs: Array<number | null>;
  white: SideTime;
  black: SideTime;
};

function mean(values: number[]): number | null {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function roundToHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

function paceFor(
  rows: ReadonlyArray<TimeRow>,
  spent: ReadonlyArray<number | null>,
  side: Side,
  decisive: boolean,
  control: TimeControl,
): { stars: number; breakdown: PaceBreakdown } | null {
  const weights = PACE_WEIGHTS;
  const mine: Array<{ row: TimeRow; ms: number }> = [];
  rows.forEach((row, index) => {
    const ms = spent[index];
    if (row.side === side && ms != null) {
      mine.push({ row, ms });
    }
  });
  if (mine.length < weights.minTimedMoves) {
    return null;
  }
  const total = mine.reduce((sum, entry) => sum + entry.ms, 0);

  // 1. Time spent on book moves.
  const bookMs = mine.filter((entry) => entry.row.label === "book").reduce((sum, entry) => sum + entry.ms, 0);
  const bookShare = total > 0 ? bookMs / total : 0;
  const bookPenalty = weights.bookMaxPenalty * Math.min(1, bookShare / weights.bookShareForFullPenalty);

  // 2. Fast moves in critical positions (book and forced moves cannot be rushed).
  const average = total / mine.length;
  const critical = mine.filter(
    (entry) => entry.row.label !== "book" && !entry.row.forced && (entry.row.weight ?? 1) >= weights.criticalVolatility,
  );
  const rushed = critical.filter((entry) => entry.ms < average * weights.fastFractionOfAverage);
  const rushedPenalty = critical.length === 0 ? 0 : weights.rushedMaxPenalty * (rushed.length / critical.length);

  // 3. Ending a decisive game with almost no time left.
  const lastClock = [...rows].reverse().find((row) => row.side === side)?.clockMs;
  const lowLimit = Math.max(weights.lowTimeFloorMs, weights.lowTimeFractionOfBase * control.baseMs);
  const lowTimePenalty = decisive && lastClock !== undefined && lastClock < lowLimit ? weights.lowTimePenalty : 0;

  const raw = weights.maxStars - bookPenalty - rushedPenalty - lowTimePenalty;
  const stars = roundToHalf(Math.max(0, Math.min(weights.maxStars, raw)));
  return { stars, breakdown: { bookPenalty, rushedPenalty, lowTimePenalty } };
}

function buildSide(
  rows: ReadonlyArray<TimeRow>,
  spent: ReadonlyArray<number | null>,
  side: Side,
  decisive: boolean,
  control: TimeControl,
): SideTime {
  const mine: Array<{ row: TimeRow; index: number; ms: number }> = [];
  rows.forEach((row, index) => {
    const ms = spent[index];
    if (row.side === side && ms != null) {
      mine.push({ row, index, ms });
    }
  });
  const totalMs = mine.reduce((sum, entry) => sum + entry.ms, 0);
  const accurate = mine.filter((entry) => entry.row.label != null && ACCURATE_LABELS.has(entry.row.label));
  const inaccurate = mine.filter((entry) => entry.row.label != null && INACCURATE_LABELS.has(entry.row.label));
  let longest: LongestThink | null = null;
  for (const entry of mine) {
    if (longest === null || entry.ms > longest.ms) {
      longest = { index: entry.index, label: entry.row.label, ms: entry.ms };
    }
  }
  const phaseShare = { opening: null, middlegame: null, endgame: null } as Record<GamePhase, number | null>;
  if (totalMs > 0) {
    for (const phase of ["opening", "middlegame", "endgame"] as const) {
      const inPhase = mine.filter((entry) => entry.row.phase === phase);
      phaseShare[phase] = inPhase.length === 0 ? null : (inPhase.reduce((sum, entry) => sum + entry.ms, 0) / totalMs) * 100;
    }
  }
  const pace = paceFor(rows, spent, side, decisive, control);
  return {
    timedMoves: mine.length,
    totalMs,
    avgMs: mean(mine.map((entry) => entry.ms)),
    avgAccurateMs: mean(accurate.map((entry) => entry.ms)),
    avgInaccurateMs: mean(inaccurate.map((entry) => entry.ms)),
    accurateMoves: accurate.length,
    inaccurateMoves: inaccurate.length,
    longest,
    premoves: mine.filter((entry) => entry.ms <= PREMOVE_MAX_MS).length,
    phaseShare,
    pace: pace?.stars ?? null,
    paceBreakdown: pace?.breakdown ?? null,
  };
}

/**
 * Builds the time report for the reviewed rows, or null when the game has no
 * usable clocks: no/unsupported `TimeControl` (including daily and
 * correspondence games), or fewer than `MIN_CLOCK_COVERAGE` of the rows carry
 * a clock. A missing `TimeControl` is NOT inferred from the clocks: the first
 * clock after a move cannot tell the base time from base - spent + increment.
 */
export function buildTimeReport(rows: ReadonlyArray<TimeRow>, timeControl: string | undefined | null): TimeReport | null {
  const control = parseTimeControl(timeControl);
  if (!control || rows.length === 0 || clockCoverage(rows) < MIN_CLOCK_COVERAGE) {
    return null;
  }
  const spentMs = timeSpentPerMove(rows, control);
  if (spentMs.every((ms) => ms === null)) {
    return null;
  }
  const lastEval = rows[rows.length - 1].afterPawns;
  const decisive = Math.abs(lastEval) >= PACE_WEIGHTS.decisivePawns;
  return {
    control,
    spentMs,
    white: buildSide(rows, spentMs, "w", decisive, control),
    black: buildSide(rows, spentMs, "b", decisive, control),
  };
}
