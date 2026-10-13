import { fenKey, getFenAt, getNodeAt, type GameTree, type Path, type TreeNode } from "./tree";

export type RepertoireMove = {
  uci: string;
  san: string;
  path: Path;
};

export function repertoireMoves(tree: GameTree, path: Path): RepertoireMove[] {
  const target = fenKey(getFenAt(tree, path));
  const moves: RepertoireMove[] = [];
  const seen = new Set<string>();

  function takeChildren(children: TreeNode[], parentPath: Path): void {
    children.forEach((child, index) => {
      if (seen.has(child.uci)) {
        return;
      }
      seen.add(child.uci);
      moves.push({
        uci: child.uci,
        san: child.san,
        path: [...parentPath, index],
      });
    });
  }

  function visit(fen: string, children: TreeNode[], nodePath: Path): void {
    if (fenKey(fen) !== target) {
      return;
    }
    takeChildren(children, nodePath);
  }

  visit(tree.startFen, tree.children, []);
  function walk(nodes: TreeNode[], parentPath: Path): void {
    nodes.forEach((node, index) => {
      const nodePath = [...parentPath, index];
      visit(node.fen, node.children, nodePath);
      walk(node.children, nodePath);
    });
  }
  walk(tree.children, []);

  const current = getNodeAt(tree, path);
  const children = path.length === 0 ? tree.children : (current?.children ?? []);
  for (const move of moves) {
    const index = children.findIndex((child) => child.uci === move.uci);
    const child = children[index];
    if (index < 0 || !child) {
      continue;
    }
    move.path = [...path, index];
    move.san = child.san;
  }
  return moves;
}

export interface SpacedRepetitionItem {
  lastReviewedAt: string;
  intervalDays: number;
  easeFactor: number;
  dueDate: string;
  mistakeCount: number;
}

export interface DueRepertoireMove {
  key: string;
  path: Path;
  fen: string;
  uci: string;
  san: string;
}

export function repertoireMoveKey(fen: string, uci: string): string {
  return `${fenKey(fen)}:${uci}`;
}

export function scheduleReview(
  current: SpacedRepetitionItem | undefined,
  correct: boolean,
  now: Date = new Date(),
): SpacedRepetitionItem {
  const defaultEase = 2.5;
  const easeFactor = current?.easeFactor ?? defaultEase;
  const mistakeCount = (current?.mistakeCount ?? 0) + (correct ? 0 : 1);
  const nowMs = now.getTime();
  const dayMs = 24 * 60 * 60 * 1000;

  let nextInterval: number;
  let nextEase: number;

  if (correct) {
    if (!current || current.intervalDays <= 0) {
      nextInterval = 1;
    } else if (current.intervalDays === 1) {
      nextInterval = 6;
    } else {
      nextInterval = Math.round(current.intervalDays * easeFactor);
    }
    nextEase = Math.max(1.3, Number((easeFactor + 0.1).toFixed(2)));
  } else {
    nextInterval = 1;
    nextEase = Math.max(1.3, Number((easeFactor - 0.2).toFixed(2)));
  }

  const dueDate = new Date(nowMs + nextInterval * dayMs).toISOString();

  return {
    lastReviewedAt: now.toISOString(),
    intervalDays: nextInterval,
    easeFactor: nextEase,
    dueDate,
    mistakeCount,
  };
}

export function isDue(item: SpacedRepetitionItem | undefined, now: Date = new Date()): boolean {
  if (!item) {
    return true;
  }
  return new Date(item.dueDate).getTime() <= now.getTime();
}

export function getDueRepertoireMoves(
  tree: GameTree,
  progress: Record<string, SpacedRepetitionItem>,
  now: Date = new Date(),
): DueRepertoireMove[] {
  const dueMoves: DueRepertoireMove[] = [];
  const seenKeys = new Set<string>();

  function scanNode(fen: string, children: TreeNode[], path: Path) {
    for (const child of children) {
      const key = repertoireMoveKey(fen, child.uci);
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        if (isDue(progress[key], now)) {
          dueMoves.push({
            key,
            path,
            fen,
            uci: child.uci,
            san: child.san,
          });
        }
      }
    }
    children.forEach((child, index) => {
      scanNode(child.fen, child.children, [...path, index]);
    });
  }

  scanNode(tree.startFen, tree.children, []);
  return dueMoves;
}
