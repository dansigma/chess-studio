// SIG-1094: pure repertoire-deviation actions. No store/chess.js imports —
// `findPathToPosition` locates the deviation position inside the repertoire
// tree, `withMoveDue` marks a repertoire move due without touching its
// interval/ease, and `addOpponentMove` appends the opponent's novelty move.
// All reads/writes are immutable; chess.js derivation lives in the store
// action so this module stays import-light and unit-testable.
import { fenKey, playMove, type GameTree, type Path, type TreeNode } from "./tree";
import { repertoireMoveKey, type SpacedRepetitionItem } from "./repertoire";

/** First path (DFS pre-order, root first) whose position's `fenKey` matches;
 * `[]` for the start position, `null` when the position is absent. Any
 * transposed occurrence wins — training starts from an equivalent position. */
export function findPathToPosition(tree: GameTree, fen: string): Path | null {
  const target = fenKey(fen);
  if (fenKey(tree.startFen) === target) {
    return [];
  }
  function walk(nodes: TreeNode[], parentPath: Path): Path | null {
    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index];
      if (!node) {
        continue;
      }
      const nodePath = [...parentPath, index];
      if (fenKey(node.fen) === target) {
        return nodePath;
      }
      const deeper = walk(node.children, nodePath);
      if (deeper) {
        return deeper;
      }
    }
    return null;
  }
  return walk(tree.children, []);
}

/** Copy of `progress` with the `(fen, uci)` move's `dueDate` set to `now` and
 * everything else preserved. A missing item gets the zero-history shape so
 * the next correct review advances to interval 1 (mirrors `scheduleReview`
 * with no current item, minus the review itself). Never mutates the input. */
export function withMoveDue(
  progress: Record<string, SpacedRepetitionItem>,
  fen: string,
  uci: string,
  now: Date = new Date(),
): Record<string, SpacedRepetitionItem> {
  const key = repertoireMoveKey(fen, uci);
  const existing = progress[key];
  return {
    ...progress,
    [key]: {
      lastReviewedAt: existing?.lastReviewedAt ?? now.toISOString(),
      intervalDays: existing?.intervalDays ?? 0,
      easeFactor: existing?.easeFactor ?? 2.5,
      dueDate: now.toISOString(),
      mistakeCount: existing?.mistakeCount ?? 0,
    },
  };
}

/** Append the opponent's novelty move at the deviation position. Returns the
 * new tree plus the new node's path, or `null` when the position is not in
 * the tree. Idempotent: an existing identical UCI reuses the child (via
 * `playMove` dedupe), so double-clicking never duplicates the node. */
export function addOpponentMove(
  tree: GameTree,
  fen: string,
  move: Pick<TreeNode, "san" | "uci" | "fen" | "from" | "to">,
): { tree: GameTree; path: Path } | null {
  const path = findPathToPosition(tree, fen);
  if (!path) {
    return null;
  }
  return playMove(tree, path, move);
}
