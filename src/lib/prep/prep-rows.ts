// SIG-1101: pure row/mapping helpers for the Opponent prep panel
// (Insights 4/4). Dependency-light: `pgn-clean` for SAN numbering, types from
// `opening-tree` and `player-types`. Same grain as `opening-rows.ts` (total
// functions, no throws, deterministic). Shares the `key`/`depth`/`path`
// semantics of `openingRows` so expansion state behaves identically; the one
// addition is each row's share of its parent's games (`sharePct`).
import { numberSanLine } from "@/src/chess/pgn-clean";
import type { OpeningNode } from "@/src/lib/my-games/opening-tree";
import { syntheticLineGame } from "@/src/lib/my-games/opening-rows";
import type { PlayerGame } from "@/src/lib/player-types";

export type PrepColor = "white" | "black";

export type OpponentMostPlayed = { san: string; games: number };

export type OpponentProfile = {
  gamesAnalyzed: number;
  white: OpeningNode;
  black: OpeningNode;
  mostPlayed: { white: OpponentMostPlayed[]; black: OpponentMostPlayed[] };
};

export type OpponentPrepSource = "lichess" | "chesscom";

export type PrepRow = {
  key: string;
  depth: number;
  path: string[];
  san: string;
  numberedSan: string;
  node: OpeningNode;
  sharePct: number;
  hasChildren: boolean;
  expanded: boolean;
};

function shareOf(games: number, parentGames: number): number {
  if (!Number.isFinite(games) || !Number.isFinite(parentGames) || parentGames <= 0) {
    return 0;
  }
  return Math.round((100 * games) / parentGames);
}

/**
 * Flattens the visible nodes pre-order. The root itself is never emitted.
 * `key` is the space-joined SAN path (unique per node since transpositions
 * are not merged). `numberedSan` renders the full path with move numbers
 * (e.g. "1. e4 e5"). `sharePct` is the node's games as a rounded share of
 * its parent's games (depth-0 rows divide by `root.games`).
 */
export function prepRows(root: OpeningNode, expandedKeys: ReadonlySet<string>): PrepRow[] {
  const rows: PrepRow[] = [];
  function visit(node: OpeningNode, path: string[], depth: number, parentGames: number): void {
    for (const child of node.children) {
      const childPath = [...path, child.san];
      const key = childPath.join(" ");
      const expanded = expandedKeys.has(key) && child.children.length > 0;
      rows.push({
        key,
        depth,
        path: childPath,
        san: child.san,
        numberedSan: numberSanLine(key),
        node: child,
        sharePct: shareOf(child.games, parentGames),
        hasChildren: child.children.length > 0,
        expanded,
      });
      if (expandedKeys.has(key)) {
        visit(child, childPath, depth + 1, child.games);
      }
    }
  }
  visit(root, [], 0, root.games);
  return rows;
}

/**
 * Maps a tree line to the user's preparation: opens the opponent's SAN path
 * oriented to the user's side (opposite of the tree color — preparing
 * against White's 1.e4 means playing Black). Reuses `syntheticLineGame`
 * (the same shape `openListedGame` prefers in the SIG-1099 open-line flow).
 */
export function prepareAgainstLine(
  path: string[],
  treeColor: PrepColor,
): { game: PlayerGame; orientation: "white" | "black" } {
  const orientation: "white" | "black" = treeColor === "white" ? "black" : "white";
  return { game: syntheticLineGame(path, orientation), orientation };
}
