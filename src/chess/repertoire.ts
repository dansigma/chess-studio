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
