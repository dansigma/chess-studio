import {
  cloneTree,
  fenKey,
  getNodeAt,
  newNodeId,
  type GameTree,
  type Path,
  type TreeNode,
} from "@/src/chess/tree";

export type LiveMergeResult = {
  tree: GameTree;
  path: Path;
  addedMoves: number;
  diverged: boolean;
};

function cloneMainlineNode(node: TreeNode, children: TreeNode[]): TreeNode {
  return {
    id: newNodeId(),
    san: node.san,
    uci: node.uci,
    fen: node.fen,
    from: node.from,
    to: node.to,
    ...(node.comment !== undefined ? { comment: node.comment } : {}),
    ...(node.commentBefore !== undefined ? { commentBefore: node.commentBefore } : {}),
    ...(node.nags !== undefined ? { nags: [...node.nags] } : {}),
    ...(node.marks !== undefined ? { marks: structuredClone(node.marks) } : {}),
    ...(node.clockMs !== undefined ? { clockMs: node.clockMs } : {}),
    ...(node.evalPawns !== undefined ? { evalPawns: node.evalPawns } : {}),
    ...(node.evalMate !== undefined ? { evalMate: node.evalMate } : {}),
    children,
  };
}

function cloneMainlineTail(nodes: TreeNode[]): TreeNode {
  let child: TreeNode[] = [];
  for (let i = nodes.length - 1; i >= 0; i--) {
    child = [cloneMainlineNode(nodes[i]!, child)];
  }
  return child[0]!;
}

function findPathById(nodes: TreeNode[], targetId: string, prefix: Path = []): Path | null {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]!;
    const path = [...prefix, i];
    if (node.id === targetId) {
      return path;
    }
    const nested = findPathById(node.children, targetId, path);
    if (nested) {
      return nested;
    }
  }
  return null;
}

/**
 * SIG-1406: merges newly played mainline moves from `incomingTree` into `localTree`
 * without erasing any existing user variations, comments, NAGs, or marks.
 * Keeps `currentPath` pointing at the same node if an insertion shifts sibling indices.
 */
export function mergeLiveMainline(
  localTree: GameTree,
  incomingTree: GameTree,
  currentPath: Path,
): LiveMergeResult {
  if (fenKey(localTree.startFen) !== fenKey(incomingTree.startFen)) {
    return { tree: localTree, path: currentPath, addedMoves: 0, diverged: true };
  }

  const incomingMainline: TreeNode[] = [];
  for (let node = incomingTree.children[0]; node; node = node.children[0]) {
    incomingMainline.push(node);
  }
  if (incomingMainline.length === 0) {
    return { tree: localTree, path: currentPath, addedMoves: 0, diverged: false };
  }

  const targetNodeId = currentPath.length > 0 ? getNodeAt(localTree, currentPath)?.id ?? null : null;
  const next = cloneTree(localTree);
  let siblings = next.children;
  let addedMoves = 0;

  for (let i = 0; i < incomingMainline.length; i++) {
    const incoming = incomingMainline[i]!;
    const match = siblings.find((child) => child.uci === incoming.uci);
    if (match) {
      if (match.clockMs === undefined && incoming.clockMs !== undefined) {
        match.clockMs = incoming.clockMs;
      }
      if (match.evalPawns === undefined && incoming.evalPawns !== undefined) {
        match.evalPawns = incoming.evalPawns;
      }
      if (match.evalMate === undefined && incoming.evalMate !== undefined) {
        match.evalMate = incoming.evalMate;
      }
      siblings = match.children;
      continue;
    }
    siblings.unshift(cloneMainlineTail(incomingMainline.slice(i)));
    addedMoves = incomingMainline.length - i;
    break;
  }

  if (addedMoves === 0) {
    return { tree: localTree, path: currentPath, addedMoves: 0, diverged: false };
  }

  const nextPath = targetNodeId ? (findPathById(next.children, targetNodeId) ?? currentPath) : currentPath;
  return { tree: next, path: nextPath, addedMoves, diverged: false };
}
