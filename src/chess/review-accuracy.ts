import { winChance } from "./review.ts";

// Volatility-weighted player accuracy (lichess-style model, public formulas):
// each move's accuracy is weighted by how much the win chance swings around it,
// then blended with a harmonic mean so single bad moves still pull the figure down.

const CP_CEILING = 1000;
/** Scores at or beyond this many pawns are mate scores (see `scoreNumber`). */
const MATE_PAWNS = 900;
const MIN_WINDOW = 2;
const MAX_WINDOW = 8;
const MIN_WEIGHT = 0.5;
const MAX_WEIGHT = 12;
/** Move accuracies are floored here inside the harmonic part. */
const HARMONIC_FLOOR = 10;

export type AccuracySample = {
  /** Per-move accuracy, 0–100. */
  accuracy: number;
  /** Volatility weight; defaults to 1 when the caller has none. */
  weight?: number;
};

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

/** White's win chance (%) for a white-perspective score in pawns; mate counts as 100 / 0. */
export function whiteWinChance(whitePawns: number): number {
  if (whitePawns >= MATE_PAWNS) {
    return 100;
  }
  if (whitePawns <= -MATE_PAWNS) {
    return 0;
  }
  return winChance(clamp(Math.round(whitePawns * 100), -CP_CEILING, CP_CEILING));
}

export function volatilityWindow(moveCount: number): number {
  return clamp(Math.ceil(moveCount / 10), MIN_WINDOW, MAX_WINDOW);
}

/**
 * One weight per move. `winChances` holds the white win chance (%) of every
 * position (moveCount + 1 entries); move `i` is weighted by the standard
 * deviation of a window of positions centred on it.
 */
export function volatilityWeights(winChances: number[]): number[] {
  const moveCount = Math.max(0, winChances.length - 1);
  const size = Math.min(volatilityWindow(moveCount), winChances.length);
  const weights: number[] = [];
  for (let move = 0; move < moveCount; move += 1) {
    const start = clamp(move - Math.floor((size - 1) / 2), 0, winChances.length - size);
    const slice = winChances.slice(start, start + size);
    const mean = slice.reduce((sum, value) => sum + value, 0) / slice.length;
    const variance = slice.reduce((sum, value) => sum + (value - mean) ** 2, 0) / slice.length;
    weights.push(clamp(Math.sqrt(variance), MIN_WEIGHT, MAX_WEIGHT));
  }
  return weights;
}

/** Average of the volatility-weighted mean and the harmonic mean, rounded to 0.1; null when empty. */
export function playerAccuracy(samples: AccuracySample[]): number | null {
  if (samples.length === 0) {
    return null;
  }
  let weightSum = 0;
  let weighted = 0;
  let inverseSum = 0;
  for (const sample of samples) {
    const weight = sample.weight ?? 1;
    weightSum += weight;
    weighted += sample.accuracy * weight;
    inverseSum += 1 / Math.max(sample.accuracy, HARMONIC_FLOOR);
  }
  const weightedMean = weighted / weightSum;
  const harmonicMean = samples.length / inverseSum;
  return Math.round(((weightedMean + harmonicMean) / 2) * 10) / 10;
}
