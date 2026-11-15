// SIG-1347: the Opponent prep tree was retired; only the "prepare against a
// line" mapping remains, used by the Library player dossier. Dependency-light:
// reuses `syntheticLineGame` (the same shape `openListedGame` prefers in the
// SIG-1099 open-line flow).
import { syntheticLineGame } from "@/src/lib/my-games/opening-rows";
import { numberSanLine } from "@/src/chess/pgn-clean";
import { tLibrary } from "@/src/i18n/library-strings";
import type { SiteLocale } from "@/src/i18n/locale";
import type { PlayerGame } from "@/src/lib/player-types";

export type PrepColor = "white" | "black";

/** Tab/header label for a synthetic preparation line (no real players). */
export function preparationLineTitle(locale: SiteLocale, path: string[]): string {
  const base = tLibrary(locale, "library.dossier.lineTitle");
  const moves = path.length > 0 ? numberSanLine(path.join(" ")) : "";
  return moves.length > 0 ? `${base} · ${moves}` : base;
}

/**
 * Maps a tree line to the user's preparation: opens the opponent's SAN path
 * oriented to the user's side (opposite of the tree color — preparing
 * against White's 1.e4 means playing Black).
 */
export function prepareAgainstLine(
  path: string[],
  treeColor: PrepColor,
  label?: string,
): { game: PlayerGame; orientation: "white" | "black" } {
  const orientation: "white" | "black" = treeColor === "white" ? "black" : "white";
  return { game: syntheticLineGame(path, orientation, label), orientation };
}
