import type { PlayerColorFilter, PlayerHit, PlayerResultFilter } from "@/src/lib/player-types";

export type PlayerPanelParams = {
  player: PlayerHit | null;
  color: PlayerColorFilter;
  result: PlayerResultFilter;
};

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function parsePlayerPanelParams(value: unknown): PlayerPanelParams {
  const { player, color, result } = record(value);
  const { id, source, username, displayName, subtitle, title, inDatabases } = record(player);
  const validPlayer = typeof id === "string" && id.trim() &&
    (source === "lichess" || source === "chesscom" || source === "studio") &&
    typeof username === "string" && username.trim() &&
    typeof displayName === "string" && displayName.trim() && typeof subtitle === "string";
  return {
    player: validPlayer ? {
      id, source, username, displayName, subtitle,
      ...(typeof title === "string" ? { title } : {}),
      ...(typeof inDatabases === "boolean" ? { inDatabases } : {}),
    } : null,
    color: color === "white" || color === "black" ? color : "all",
    result: result === "win" || result === "loss" || result === "draw" ? result : "all",
  };
}
