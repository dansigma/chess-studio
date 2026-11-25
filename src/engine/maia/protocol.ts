export type MaiaPosition = { fens: readonly string[]; elo: number; lines: number };
export type MaiaMove = { uci: string; prob: number };
export type MaiaResult = { moves: MaiaMove[] };
export type MaiaResponse = { result: MaiaResult } | { error: string };

export const MAIA_MIN_ELO = 600;
export const MAIA_MAX_ELO = 2600;
export const MAIA_ELO_STEP = 100;
export const MAIA_DEFAULT_ELO = 1500;
export const MAIA_MIN_LINES = 1;
export const MAIA_MAX_LINES = 5;
export const MAIA_DEFAULT_LINES = 3;
export const MAIA_ELOS = Array.from(
  { length: (MAIA_MAX_ELO - MAIA_MIN_ELO) / MAIA_ELO_STEP + 1 },
  (_, index) => MAIA_MIN_ELO + index * MAIA_ELO_STEP,
);

export function clampMaiaElo(elo: unknown): number {
  if (typeof elo !== "number" || !Number.isFinite(elo)) return MAIA_DEFAULT_ELO;
  return Math.max(MAIA_MIN_ELO, Math.min(MAIA_MAX_ELO, Math.round(elo / MAIA_ELO_STEP) * MAIA_ELO_STEP));
}

export function clampMaiaLines(lines: unknown): number {
  if (typeof lines !== "number" || !Number.isFinite(lines)) return MAIA_DEFAULT_LINES;
  return Math.max(MAIA_MIN_LINES, Math.min(MAIA_MAX_LINES, Math.round(lines)));
}
