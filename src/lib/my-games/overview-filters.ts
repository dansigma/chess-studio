// SIG-1305: pure filter + KPI helpers for the My Stats Overview tab. The panel
// computes `filterGames` once and feeds the result to every Overview aggregate.
import type { PlayerGame } from "@/src/lib/player-types";
import { openingFilterToTreeFilters, type OpeningDatePreset } from "./opening-rows";
import { ACCURACY_TREND_WINDOW } from "./stats";

export type OverviewColor = "all" | "white" | "black";

export type OverviewFilters = {
  preset: OpeningDatePreset;
  timeClass: string | "all";
  color: OverviewColor;
};

export const DEFAULT_OVERVIEW_FILTERS: OverviewFilters = { preset: "all", timeClass: "all", color: "all" };

export function isDefaultOverviewFilters(filters: OverviewFilters): boolean {
  return filters.preset === "all" && filters.timeClass === "all" && filters.color === "all";
}

/**
 * Applies period / time class / colour. Games without `playedAt` only pass
 * the "all" period (an undated game cannot be placed in a window).
 */
export function filterGames(games: readonly PlayerGame[], filters: OverviewFilters, now: number): PlayerGame[] {
  const from = openingFilterToTreeFilters({ timeClass: "all", ratedOnly: false, preset: filters.preset }, now).from;
  return games.filter((game) => {
    if (from !== undefined && (game.playedAt == null || game.playedAt < from)) {
      return false;
    }
    if (filters.timeClass !== "all" && game.timeClass !== filters.timeClass) {
      return false;
    }
    if (filters.color !== "all" && game.color !== filters.color) {
      return false;
    }
    return true;
  });
}

export type AccuracyDirection = "up" | "down" | "flat";

export type OverviewKpis = {
  games: number;
  reviewed: number;
  /** Mean accuracy over reviewed games; null when none. */
  avgAccuracy: number | null;
  direction: AccuracyDirection;
  /** True when direction is "flat" only because there were < 2 full windows. */
  insufficientForTrend: boolean;
  wins: number;
  draws: number;
  losses: number;
  /** Rounded score %; `playerResult: null` games count as 0 points (as `resultsByOpening`). Null when 0 games. */
  scorePct: number | null;
};

/** Minimum mean difference (points) before the arrow leaves "flat". */
export const ACCURACY_FLAT_THRESHOLD = 1;

export function overviewKpis(games: readonly PlayerGame[], windowSize: number = ACCURACY_TREND_WINDOW): OverviewKpis {
  const reviewedGames = games
    .filter(
      (game) =>
        game.reviewedAt != null && typeof game.userAccuracy === "number" && Number.isFinite(game.userAccuracy),
    )
    .sort((a, b) => {
      const at = a.playedAt ?? 0;
      const bt = b.playedAt ?? 0;
      if (at !== bt) {
        return at - bt;
      }
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
  const accuracies = reviewedGames.map((game) => game.userAccuracy as number);
  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  let direction: AccuracyDirection = "flat";
  let insufficientForTrend = true;
  if (accuracies.length >= windowSize * 2) {
    insufficientForTrend = false;
    const last = mean(accuracies.slice(-windowSize));
    const before = mean(accuracies.slice(-windowSize * 2, -windowSize));
    const diff = last - before;
    direction = diff >= ACCURACY_FLAT_THRESHOLD ? "up" : diff <= -ACCURACY_FLAT_THRESHOLD ? "down" : "flat";
  }
  let wins = 0;
  let draws = 0;
  let losses = 0;
  for (const game of games) {
    if (game.playerResult === "win") {
      wins += 1;
    } else if (game.playerResult === "draw") {
      draws += 1;
    } else if (game.playerResult === "loss") {
      losses += 1;
    }
  }
  return {
    games: games.length,
    reviewed: reviewedGames.length,
    avgAccuracy: accuracies.length === 0 ? null : mean(accuracies),
    direction,
    insufficientForTrend,
    wins,
    draws,
    losses,
    scorePct: games.length === 0 ? null : Math.round((100 * (wins + draws / 2)) / games.length),
  };
}
