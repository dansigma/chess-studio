export type MaiaPosition = { fens: readonly string[]; elo: number };
export type MaiaMove = { uci: string; prob: number; wdl: [number, number, number] };
export type MaiaResult = { moves: MaiaMove[] };
export type MaiaResponse = { result: MaiaResult } | { error: string };

export const MAIA_MIN_ELO = 600;
export const MAIA_MAX_ELO = 2600;
export const MAIA_ELO_STEP = 100;
export const MAIA_DEFAULT_ELO = 1500;

export function clampMaiaElo(elo: unknown): number {
  if (typeof elo !== "number" || !Number.isFinite(elo)) return MAIA_DEFAULT_ELO;
  return Math.max(MAIA_MIN_ELO, Math.min(MAIA_MAX_ELO, Math.round(elo / MAIA_ELO_STEP) * MAIA_ELO_STEP));
}
