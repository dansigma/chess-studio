// SIG-1347: the Opponent prep tree was retired; only the "prepare against a
// line" mapping remains, used by the Library player dossier. Dependency-light:
// reuses `syntheticLineGame` (the same shape `openListedGame` prefers in the
// SIG-1099 open-line flow).
import { syntheticLineGame } from "@/src/lib/my-games/opening-rows";
import type { PlayerGame } from "@/src/lib/player-types";

export type PrepColor = "white" | "black";

/**
 * Maps a tree line to the user's preparation: opens the opponent's SAN path
 * oriented to the user's side (opposite of the tree color — preparing
 * against White's 1.e4 means playing Black).
 */
export function prepareAgainstLine(
  path: string[],
  treeColor: PrepColor,
): { game: PlayerGame; orientation: "white" | "black" } {
  const orientation: "white" | "black" = treeColor === "white" ? "black" : "white";
  return { game: syntheticLineGame(path, orientation), orientation };
}
