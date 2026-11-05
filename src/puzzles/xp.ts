// SIG-1234: transparent XP and the growing level curve. Pure module — the
// trainer renders the returned breakdown as-is and never recomputes it.

/** XP for a solved puzzle before any multiplier. */
export const XP_BASE = 20;
/**
 * A missed (or given-up) puzzle awards nothing. A fixed consolation amount
 * would make "Solution" a farmable button, and it keeps the pre-SIG-1234
 * rule that failures never move XP.
 */
export const XP_FAILED = 0;

/** Difficulty multiplier range; 1.0 when puzzle and user ratings match. */
export const DIFFICULTY_MIN = 0.5;
export const DIFFICULTY_MAX = 2;
/** +400 rating points over the user doubles the base; -400 halves it. */
export const DIFFICULTY_SCALE = 400;

/** Speed bonus range and the time budget that defines "fast". */
export const SPEED_MAX = 1.5;
export const SPEED_PAR_MS_PER_MOVE = 20_000;
/** At or below this share of par the full bonus applies; at par it is gone. */
export const SPEED_FULL_RATIO = 0.25;

/** Solved with no hint (a wrong move ends the puzzle, so no hint == no mistake). */
export const FIRST_TRY_MULTIPLIER = 1.2;

export type XpFactorKey = "difficulty" | "speed" | "firstTry";

export type XpFactor = { key: XpFactorKey; value: number };

export type XpBreakdown = {
  /** Base XP before multipliers (0 when the puzzle was missed). */
  base: number;
  /** Only the multipliers that applied (value !== 1), in display order. */
  factors: XpFactor[];
  /** base × every factor, rounded once. */
  total: number;
};

export type XpInput = {
  success: boolean;
  puzzleRating: number;
  userRating: number;
  /** Number of moves the solver plays in the line (>= 1). */
  solverMoves: number;
  /** Time from showing the puzzle to the commit; null when unknown. */
  ms: number | null;
  /** True once any hint was requested for this puzzle. */
  hinted: boolean;
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function difficultyFactor(puzzleRating: number, userRating: number): number {
  const raw = 2 ** ((puzzleRating - userRating) / DIFFICULTY_SCALE);
  return round2(Math.min(DIFFICULTY_MAX, Math.max(DIFFICULTY_MIN, raw)));
}

export function speedFactor(ms: number | null, solverMoves: number): number {
  if (ms === null || !Number.isFinite(ms) || ms < 0) {
    return 1;
  }
  const par = SPEED_PAR_MS_PER_MOVE * Math.max(1, solverMoves);
  const ratio = ms / par;
  if (ratio <= SPEED_FULL_RATIO) {
    return SPEED_MAX;
  }
  if (ratio >= 1) {
    return 1;
  }
  const bonus = (SPEED_MAX - 1) * (1 - (ratio - SPEED_FULL_RATIO) / (1 - SPEED_FULL_RATIO));
  return round2(1 + bonus);
}

/**
 * The one XP rule. Hints remove both the speed and the first-try bonus.
 * Factor values are rounded to two decimals first so the numbers the player
 * sees multiply to the total; only the final product is rounded to an integer.
 */
export function xpBreakdown(input: XpInput): XpBreakdown {
  if (!input.success) {
    return { base: XP_FAILED, factors: [], total: XP_FAILED };
  }
  const factors: XpFactor[] = [];
  const difficulty = difficultyFactor(input.puzzleRating, input.userRating);
  if (difficulty !== 1) {
    factors.push({ key: "difficulty", value: difficulty });
  }
  if (!input.hinted) {
    const speed = speedFactor(input.ms, input.solverMoves);
    if (speed !== 1) {
      factors.push({ key: "speed", value: speed });
    }
    factors.push({ key: "firstTry", value: FIRST_TRY_MULTIPLIER });
  }
  const total = Math.round(factors.reduce((product, factor) => product * factor.value, XP_BASE));
  return { base: XP_BASE, factors, total };
}

/**
 * Level curve. Level n costs round(100 * 1.3^(n-1)) XP to clear: 100, 130,
 * 169, 220, ... Growth stops at LEVEL_GROWTH_CAP so late levels stay a fixed
 * (large) price instead of exploding.
 *
 * Tuning: an active user does about 5 puzzle attempts a day (~150 a month).
 * With ~70% solved and the typical multipliers (difficulty ~1.0, speed ~1.2,
 * first try 1.2 => ~29 XP per solve, 0 per miss) that averages ~21 XP per
 * attempt, so a month is ~3,200 XP. Reaching level 10 costs
 * the sum of levels 1-9 = 3,202 XP, i.e. about a month.
 */
export const LEVEL_BASE_XP = 100;
export const LEVEL_GROWTH = 1.3;
export const LEVEL_GROWTH_CAP = 20;

export function xpForLevel(level: number): number {
  const n = Math.min(LEVEL_GROWTH_CAP, Math.max(1, Math.floor(level)));
  return Math.round(LEVEL_BASE_XP * LEVEL_GROWTH ** (n - 1));
}

/** Total XP needed to reach `level` (level 1 starts at 0). */
export function cumulativeXpForLevel(level: number): number {
  let total = 0;
  for (let n = 1; n < level; n += 1) {
    total += xpForLevel(n);
  }
  return total;
}

export type LevelProgress = {
  level: number;
  /** XP earned inside the current level. */
  into: number;
  /** XP the current level costs. */
  span: number;
  /** XP still needed to reach the next level. */
  toNext: number;
};

export function levelFromXp(xp: number): LevelProgress {
  let remaining = Math.max(0, Math.floor(Number.isFinite(xp) ? xp : 0));
  let level = 1;
  for (;;) {
    const span = xpForLevel(level);
    if (remaining < span) {
      return { level, into: remaining, span, toNext: span - remaining };
    }
    remaining -= span;
    level += 1;
  }
}
