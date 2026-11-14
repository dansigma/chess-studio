// SIG-1338: stable grouping key for a game's opening, used by the Library
// player dossier to preselect/highlight one opening in later issues. Mirrors
// `resultsByOpening` (trim, collapse whitespace, lower case) and falls back to
// the ECO code and then to the first two plies, so nearly every game lands in
// a group.
import type { PlayerGame } from "@/src/lib/player-types";

/** First two space-separated plies of a moves string. */
function openingPrefix(moves: string | undefined): string {
  if (!moves) {
    return "";
  }
  const plies = moves.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return plies.join(" ");
}

export function openingGroupKey(game: PlayerGame): string {
  const opening = game.opening?.trim() ?? "";
  if (opening !== "") {
    return opening.replace(/\s+/g, " ").toLowerCase();
  }
  const eco = game.eco?.trim() ?? "";
  if (eco !== "") {
    return eco.toUpperCase();
  }
  return openingPrefix(game.moves);
}
