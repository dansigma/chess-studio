export type MaiaPosition = { fens: readonly string[]; elo: number; lines: number };
export type MaiaMove = { uci: string; prob: number };
/** Chances of the position for two players of the chosen rating, White's and Black's view (sum 1). */
export type MaiaChances = { white: number; draw: number; black: number };
export type MaiaResult = { moves: MaiaMove[]; chances: MaiaChances | null };
export type MaiaResponse = { result: MaiaResult } | { error: string };

export type MaiaChancesMode = "classical" | "online";

export const MAIA_ELOS = [1800, 2000, 2200, 2400, 2600] as const;
export const MAIA_DEFAULT_ELO = 2000;
export const MAIA_MIN_LINES = 1;
export const MAIA_MAX_LINES = 5;
export const MAIA_DEFAULT_LINES = 3;

export function clampMaiaElo(elo: unknown): number {
  if (typeof elo !== "number" || !Number.isFinite(elo)) return MAIA_DEFAULT_ELO;
  return MAIA_ELOS.reduce((lower, higher) => elo >= (lower + higher) / 2 ? higher : lower);
}

export function clampMaiaLines(lines: unknown): number {
  if (typeof lines !== "number" || !Number.isFinite(lines)) return MAIA_DEFAULT_LINES;
  return Math.max(MAIA_MIN_LINES, Math.min(MAIA_MAX_LINES, Math.round(lines)));
}
