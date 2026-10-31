// SIG-1099: pure row/mapping helpers for the My stats "Openings" tab
// (Insights 2/4). Dependency-light: `pgn-clean` for SAN numbering, types from
// `opening-tree` and `player-types`. Same grain as `opening-tree.ts` (total
// functions, no throws, deterministic). The panel computes `worstLines(root)`
// once and passes the flagged keys — this module owns no threshold policy.
import { numberSanLine } from "@/src/chess/pgn-clean";
import type { OpeningNode, OpeningTreeFilters } from "./opening-tree";
import type { PlayerGame } from "@/src/lib/player-types";

export type OpeningDatePreset = "m1" | "m3" | "m6" | "m12" | "all";

export type OpeningUiFilters = {
  timeClass: string | "all";
  ratedOnly: boolean;
  preset: OpeningDatePreset;
};

/** Cap on games pulled for the tree (`loadMyGames` pages until this). */
export const OPENING_MAX_GAMES = 3000;

const PRESET_MONTHS: Record<Exclude<OpeningDatePreset, "all">, number> = {
  m1: 1,
  m3: 3,
  m6: 6,
  m12: 12,
};

/**
 * UTC calendar-month cutoff, same grain as `monthCutoff` in
 * `opening-tree.ts` (kept module-private there, so the 10-line math is
 * duplicated here rather than widening the tree's API).
 */
function presetCutoff(now: number, months: number): number {
  const at = new Date(now);
  const year = at.getUTCFullYear();
  const month = at.getUTCMonth() - months;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(at.getUTCDate(), lastDay);
  return Date.UTC(
    year,
    month,
    day,
    at.getUTCHours(),
    at.getUTCMinutes(),
    at.getUTCSeconds(),
    at.getUTCMilliseconds(),
  );
}

/** Maps the panel's filter UI to the `buildOpeningTree` filter shape. */
export function openingFilterToTreeFilters(ui: OpeningUiFilters, now: number): OpeningTreeFilters {
  const filters: OpeningTreeFilters = {};
  if (ui.timeClass !== "all") {
    filters.timeClass = ui.timeClass;
  }
  if (ui.ratedOnly === true) {
    filters.ratedOnly = true;
  }
  if (ui.preset !== "all") {
    filters.from = presetCutoff(now, PRESET_MONTHS[ui.preset]);
  }
  return filters;
}

export type OpeningRow = {
  key: string;
  depth: number;
  path: string[];
  san: string;
  numberedSan: string;
  node: OpeningNode;
  isWorst: boolean;
  hasChildren: boolean;
  expanded: boolean;
};

/**
 * Flattens the visible nodes pre-order. The root itself is never emitted.
 * `key` is the space-joined SAN path (unique per node since transpositions
 * are not merged). `numberedSan` renders the full path with move numbers
 * (e.g. "1. e4 e5 2. Nf3").
 */
export function openingRows(
  root: OpeningNode,
  expandedKeys: ReadonlySet<string>,
  worstPaths?: ReadonlySet<string>,
): OpeningRow[] {
  const rows: OpeningRow[] = [];
  function visit(node: OpeningNode, path: string[], depth: number): void {
    for (const child of node.children) {
      const childPath = [...path, child.san];
      const key = childPath.join(" ");
      const expanded = expandedKeys.has(key);
      rows.push({
        key,
        depth,
        path: childPath,
        san: child.san,
        numberedSan: numberSanLine(key),
        node: child,
        isWorst: worstPaths?.has(key) ?? false,
        hasChildren: child.children.length > 0,
        expanded: expanded && child.children.length > 0,
      });
      if (expanded) {
        visit(child, childPath, depth + 1);
      }
    }
  }
  visit(root, [], 0);
  return rows;
}

/**
 * Builds the synthetic game "Open line" imports: moves-only `PlayerGame`
 * (the `importSans` shape `openListedGame` prefers). Placeholder
 * names/titles — a line is not a played game.
 */
export function syntheticLineGame(path: string[], color: "white" | "black"): PlayerGame {
  return {
    id: `opening-line:${path.join(" ")}`,
    winner: null,
    whiteName: "Opening line",
    whiteRating: null,
    blackName: "Opening line",
    blackRating: null,
    year: null,
    month: null,
    event: null,
    eco: null,
    opening: null,
    moves: path.join(" "),
    color,
    playerResult: null,
    playedAt: null,
  };
}

/** Sorted unique non-null `timeClass` values present in the loaded games. */
export function timeClassOptions(games: readonly { timeClass?: string | null }[]): string[] {
  const seen = new Set<string>();
  for (const game of games) {
    if (typeof game.timeClass === "string" && game.timeClass !== "") {
      seen.add(game.timeClass);
    }
  }
  return [...seen].sort();
}
