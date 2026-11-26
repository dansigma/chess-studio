import { MAIA_CLASSICAL_CALIBRATION } from "./classical-calibration";
import { materialPhase } from "./phase";
import { clampMaiaElo, type MaiaChances, type MaiaChancesMode } from "./protocol";

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
