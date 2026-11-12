import type { LiveGame, LivePlayer } from "@/src/lib/live/types";

export type Side = "white" | "black";

/** Side to move from the FEN, or null when the FEN is missing or malformed. */
export function sideToMove(fen: string): Side | null {
  const field = fen.split(" ")[1];
  return field === "w" ? "white" : field === "b" ? "black" : null;
}

/** The side whose clock runs: the side to move in an ongoing game that has a clock for it; else null. */
export function tickingSide(game: LiveGame): Side | null {
  if (game.result !== "*") {
    return null;
  }
  const side = sideToMove(game.fen);
  return side && game[side].clockMs !== null ? side : null;
}

/**
 * Clock to show, in ms, or null when the player has no clock. The snapshot's `clockMs` is the clock
 * after the last move; `thinkTimeSec` (JSON snapshot only, may be absent) is how long the side to move
 * had already been thinking when `updatedAt` was taken. Only the side to move of an ongoing game
 * ticks; display-only, every update replaces the base.
 */
export function displayClockMs(game: LiveGame, side: Side, now: number): number | null {
  const player: LivePlayer = game[side];
  if (player.clockMs === null) {
    return null;
  }
  if (tickingSide(game) !== side) {
    return player.clockMs;
  }
  const thought = Math.max(0, game.thinkTimeSec ?? 0) * 1000;
  const elapsed = Math.max(0, now - game.updatedAt);
  return Math.max(0, player.clockMs - thought - elapsed);
}

/** `h:mm:ss`, whole seconds (rounded up, so a running clock never shows 0:00:00 before it flags). */
export function formatDisplayClock(ms: number): string {
  const total = Math.ceil(Math.max(0, ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
