import { MAIA_CLASSICAL_CALIBRATION } from "./classical-calibration";
import { MAIA_COMBINED_CALIBRATION } from "./classical-combined";
import { materialPhase } from "./phase";
import { clampMaiaElo, type MaiaChances, type MaiaChancesMode } from "./protocol";

/** Minimum Stockfish search depth required before combining with Maia chances. */
export const MIN_COMBINED_DEPTH = 14;

const COMBINED_MIN_PROB = 1e-9;
const COMBINED_MAX_CP = 1000;
const COMBINED_CP_SCALE = 400;

export type MaiaEvalInput = { pawns: number; depth: number };

type DrawCalibration = { drawBias: number; drawSlope: number };
type MaiaRun = DrawCalibration & { modelElo: number };

export function resolveMaiaRun(elo: number, mode: MaiaChancesMode): MaiaRun {
  if (mode === "online") return { modelElo: elo, drawBias: 0, drawSlope: 0 };

  const band = clampMaiaElo(elo);
  const row = MAIA_CLASSICAL_CALIBRATION.find((entry) => entry.elo === band);
  if (!row) throw new Error(`Missing classical Maia calibration for ${band}`);
  const { modelElo, drawBias, drawSlope } = row;
  return { modelElo, drawBias, drawSlope };
}

export function calibrateChances(
  chances: MaiaChances,
  fen: string,
  { drawBias, drawSlope }: DrawCalibration,
): MaiaChances {
  if (drawBias === 0 && drawSlope === 0) return chances;

  const draw = chances.draw * Math.exp(drawBias + drawSlope * materialPhase(fen));
  const total = chances.white + draw + chances.black;
  return { white: chances.white / total, draw: draw / total, black: chances.black / total };
}

function clampProb(p: number): number {
  return Math.max(COMBINED_MIN_PROB, Math.min(1, p));
}

function dot(weights: readonly number[], features: readonly number[]): number {
  let sum = 0;
  for (let i = 0; i < weights.length; i++) {
    sum += weights[i] * features[i];
  }
  return sum;
}

/**
 * Combines raw Maia value-head chances with a White-POV Stockfish centipawn score
 * using the multinomial logistic regression model calibrated per rating band.
 */
export function combinedChances(
  maiaRaw: MaiaChances,
  cpWhite: number,
  fen: string,
  band: number,
): MaiaChances {
  const clampedBand = clampMaiaElo(band);
  const row = MAIA_COMBINED_CALIBRATION.find((entry) => entry.elo === clampedBand);
  if (!row) throw new Error(`Missing combined Maia calibration for ${clampedBand}`);

  const logD = Math.log(clampProb(maiaRaw.draw));
  const logWD = Math.log(clampProb(maiaRaw.white)) - logD;
  const logBD = Math.log(clampProb(maiaRaw.black)) - logD;
  const finiteCp = Number.isFinite(cpWhite) ? cpWhite : 0;
  const cp = Math.max(-COMBINED_MAX_CP, Math.min(COMBINED_MAX_CP, finiteCp));
  const e = Math.tanh(cp / COMBINED_CP_SCALE);
  const phase = materialPhase(fen);
  const features = [logWD, logBD, e, e * e, e * phase, phase, 1];

  const logitW = dot(row.white, features);
  const logitB = dot(row.black, features);
  const maxLogit = Math.max(0, logitW, logitB);
  const ew = Math.exp(logitW - maxLogit);
  const ed = Math.exp(-maxLogit);
  const eb = Math.exp(logitB - maxLogit);
  const total = ew + ed + eb;
  return { white: ew / total, draw: ed / total, black: eb / total };
}

/**
 * Resolves the displayed Maia chances from raw worker output:
 * - "online" mode returns raw chances as-is.
 * - "classical" mode uses the combined Maia + Stockfish model when the engine is
 *   active and has an eval at depth >= MIN_COMBINED_DEPTH, otherwise falls back
 *   to Maia-only classical calibration.
 */
export function resolveMaiaChances(
  maiaRaw: MaiaChances,
  fen: string,
  mode: MaiaChancesMode,
  elo: number,
  stockfishEval: MaiaEvalInput | null | undefined,
  engineActive: boolean,
): MaiaChances {
  if (mode === "online") return maiaRaw;
  if (engineActive && stockfishEval && stockfishEval.depth >= MIN_COMBINED_DEPTH) {
    return combinedChances(maiaRaw, stockfishEval.pawns * 100, fen, elo);
  }
  return calibrateChances(maiaRaw, fen, resolveMaiaRun(elo, mode));
}
