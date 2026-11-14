// SIG-1345: the user's own results in one dossier opening line.
// The dossier shows the opponent's openings; this module answers "how do I do
// in that same sequence of moves?" from the user's games of the opposite
// colour. Matching is by SAN prefix, never by opening name (transpositions and
// misspelled names must not join two different lines).
import type { MistakeCounts, MistakeTier } from "@/src/lib/my-games/review-queue";
import type { PlayerGame } from "@/src/lib/player-types";
import { sanMovesForGame } from "./game-sans";

export type OwnLineStats = {
  games: number;
  /** Draws count half a point, exactly like `resultsByOpening`. */
  scorePct: number;
  /**
   * Mean `userAccuracy` over the matching REVIEWED games that carry one, as the
   * issue gates it; null when no matching game was reviewed (SIG-1345 review).
   */
  avgAccuracy: number | null;
  /**
   * Sum of the opening-phase mistake tiers over the matching reviewed games.
   * Null when no matching game was reviewed.
   */
  openingMistakes: number | null;
};

const TIERS: readonly MistakeTier[] = ["inaccuracy", "mistake", "miss", "blunder"];

function startsWith(sans: readonly string[], line: readonly string[]): boolean {
  if (line.length > sans.length) {
    return false;
  }
  for (let ply = 0; ply < line.length; ply += 1) {
    if (sans[ply] !== line[ply]) {
      return false;
    }
  }
  return true;
}

function accuracyOf(game: PlayerGame): number | null {
  const value = game.userAccuracy;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Opening-phase tier sum of one game; malformed fragments are skipped. */
function openingMistakesOf(game: PlayerGame): number {
  const counts = game.mistakeCounts;
  if (counts === null || typeof counts !== "object") {
    return 0;
  }
  const opening = (counts as Partial<MistakeCounts>).opening;
  if (opening === null || typeof opening !== "object") {
    return 0;
  }
  let total = 0;
  for (const tier of TIERS) {
    const value = (opening as Partial<Record<MistakeTier, unknown>>)[tier];
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      total += value;
    }
  }
  return total;
}

/**
 * The user's numbers in `line`, for games of `myColor` whose moves start with
 * that exact SAN sequence. Returns null when the line is empty or no game of
 * that colour follows it — the card then shows "no games of yours here".
 */
export function ownLineStats(
  myGames: readonly PlayerGame[],
  line: readonly string[],
  myColor: "white" | "black",
): OwnLineStats | null {
  if (line.length === 0) {
    return null;
  }
  const matched: PlayerGame[] = [];
  for (const game of myGames) {
    if (game.color !== myColor) {
      continue;
    }
    if (startsWith(sanMovesForGame(game), line)) {
      matched.push(game);
    }
  }
  if (matched.length === 0) {
    return null;
  }

  let wins = 0;
  let draws = 0;
  let accuracySum = 0;
  let accuracyCount = 0;
  let reviewed = 0;
  let openingMistakes = 0;
  for (const game of matched) {
    if (game.playerResult === "win") {
      wins += 1;
    } else if (game.playerResult === "draw") {
      draws += 1;
    }
    // Both halves of the line describe the reviewed pool: a game can carry
    // `userAccuracy` without `reviewedAt`, and mixing pools would show an
    // accuracy next to "no reviewed game" (SIG-1345 review).
    if (game.reviewedAt != null) {
      reviewed += 1;
      openingMistakes += openingMistakesOf(game);
      const accuracy = accuracyOf(game);
      if (accuracy !== null) {
        accuracySum += accuracy;
        accuracyCount += 1;
      }
    }
  }

  return {
    games: matched.length,
    scorePct: Math.round((100 * (wins + 0.5 * draws)) / matched.length),
    avgAccuracy: accuracyCount === 0 ? null : accuracySum / accuracyCount,
    openingMistakes: reviewed === 0 ? null : openingMistakes,
  };
}
