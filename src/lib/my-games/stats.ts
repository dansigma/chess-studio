// SIG-1091: pure cross-game statistics for the "My stats" panel (My Games 5/5).
// Dependency-free except types: aggregates `PlayerGame[]` loaded from
// `my_games` into an accuracy trend, results-by-opening table rows, and
// per-phase mistake totals. All three functions are total (never throw on
// empty/malformed input) and deterministic.
import type { GamePhase } from "@/src/chess/phases";
import type { PlayerGame } from "@/src/lib/player-types";
import type { MistakeCounts, MistakeTier } from "./review-queue";

export type AccuracyPoint = {
  playedAt: number;
  accuracy: number;
};

export type OpeningResult = {
  opening: string;
  color: "white" | "black";
  games: number;
  wins: number;
  draws: number;
  losses: number;
  scorePct: number;
};

export type MyStatsViewState = "empty" | "ready";

/** Minimum reviewed games before the stats panel shows charts. */
export const MY_STATS_MIN_REVIEWED = 3;

/** Default trailing window for `accuracyTrend`. */
export const ACCURACY_TREND_WINDOW = 10;

const PHASES: readonly GamePhase[] = ["opening", "middlegame", "endgame"];
const TIERS: readonly MistakeTier[] = ["inaccuracy", "mistake", "miss", "blunder"];

function isReviewed(game: PlayerGame): boolean {
  return game.reviewedAt != null && game.userAccuracy != null;
}

function clampWindowSize(windowSize: number): number {
  // SIG-1091 decision: non-finite / non-positive sizes clamp to >= 1,
  // fractional sizes floor (a window of 0 games is meaningless; falling back
  // to the default 10 would silently widen the average).
  if (!Number.isFinite(windowSize)) {
    return 1;
  }
  return Math.max(1, Math.floor(windowSize));
}

/**
 * Trailing moving average of user accuracy over reviewed games, oldest first.
 * `playedAt` null games sort after dated ones (as `0`) but still contribute
 * in load order; ties break by `id` for determinism.
 */
export function accuracyTrend(games: readonly PlayerGame[], windowSize: number = ACCURACY_TREND_WINDOW): AccuracyPoint[] {
  const window = clampWindowSize(windowSize);
  const reviewed = games.filter(isReviewed);
  reviewed.sort((a, b) => {
    const at = a.playedAt ?? 0;
    const bt = b.playedAt ?? 0;
    if (at !== bt) {
      return at - bt;
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  const points: AccuracyPoint[] = [];
  for (let index = 0; index < reviewed.length; index += 1) {
    const start = Math.max(0, index - window + 1);
    let sum = 0;
    let count = 0;
    for (let cursor = start; cursor <= index; cursor += 1) {
      const accuracy = reviewed[cursor]?.userAccuracy;
      if (typeof accuracy === "number" && Number.isFinite(accuracy)) {
        sum += accuracy;
        count += 1;
      }
    }
    if (count === 0) {
      continue;
    }
    points.push({ playedAt: reviewed[index]?.playedAt ?? 0, accuracy: sum / count });
  }
  return points;
}

/**
 * Win/draw/loss rows grouped by trimmed opening name × side color, over all
 * games (results need no review). Null/blank openings are skipped; case is
 * preserved with no normalization. Null `playerResult` rows count as a game
 * played with 0 points. Groups with fewer than 3 games are dropped.
 */
export function resultsByOpening(games: readonly PlayerGame[]): OpeningResult[] {
  const groups = new Map<string, { opening: string; color: "white" | "black"; games: number; wins: number; draws: number; losses: number; points: number }>();
  for (const game of games) {
    const raw = game.opening?.trim() ?? "";
    if (!raw) {
      continue;
    }
    const key = `${game.color}	${raw}`;
    let group = groups.get(key);
    if (!group) {
      group = { opening: raw, color: game.color, games: 0, wins: 0, draws: 0, losses: 0, points: 0 };
      groups.set(key, group);
    }
    group.games += 1;
    if (game.playerResult === "win") {
      group.wins += 1;
      group.points += 1;
    } else if (game.playerResult === "draw") {
      group.draws += 1;
      group.points += 0.5;
    } else if (game.playerResult === "loss") {
      group.losses += 1;
    }
    // `playerResult: null` (unfinished / outcome-less imports) counts toward
    // `games` with 0 points — a deliberate one-line decision: dropping them
    // instead would inflate the score of lines full of abandoned games.
  }
  const rows: OpeningResult[] = [];
  for (const group of groups.values()) {
    if (group.games < 3) {
      continue;
    }
    rows.push({
      opening: group.opening,
      color: group.color,
      games: group.games,
      wins: group.wins,
      draws: group.draws,
      losses: group.losses,
      scorePct: Math.round((100 * group.points) / group.games),
    });
  }
  rows.sort((a, b) => {
    if (a.games !== b.games) {
      return b.games - a.games;
    }
    if (a.opening !== b.opening) {
      return a.opening < b.opening ? -1 : 1;
    }
    return a.color < b.color ? -1 : a.color > b.color ? 1 : 0;
  });
  return rows;
}

export function emptyMistakeTotals(): MistakeCounts {
  const phase = (): Record<MistakeTier, number> => ({ inaccuracy: 0, mistake: 0, miss: 0, blunder: 0 });
  return { opening: phase(), middlegame: phase(), endgame: phase() };
}

/**
 * Sums `mistakeCounts` over reviewed games (`reviewedAt != null`; unreviewed
 * rows never carry counts but are guarded anyway). Missing/null/malformed
 * fragments are skipped defensively (fail-open sum of what validates).
 */
export function mistakesByPhase(games: readonly PlayerGame[]): MistakeCounts {
  const totals = emptyMistakeTotals();
  for (const game of games) {
    if (game.reviewedAt == null) {
      continue;
    }
    const counts = game.mistakeCounts;
    if (counts == null || typeof counts !== "object") {
      continue;
    }
    for (const phase of PHASES) {
      const phaseCounts = (counts as Partial<Record<GamePhase, unknown>>)[phase];
      if (phaseCounts == null || typeof phaseCounts !== "object") {
        continue;
      }
      const tiers = phaseCounts as Partial<Record<MistakeTier, unknown>>;
      for (const tier of TIERS) {
        const value = tiers[tier];
        if (typeof value === "number" && Number.isFinite(value) && value > 0) {
          totals[phase][tier] += value;
        }
      }
    }
  }
  return totals;
}

/** Empty-state rule for the stats panel: fewer than 3 reviewed games. */
export function myStatsViewState(reviewedCount: number): MyStatsViewState {
  return reviewedCount >= MY_STATS_MIN_REVIEWED ? "ready" : "empty";
}
