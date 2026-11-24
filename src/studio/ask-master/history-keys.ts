import { bookKey } from "@/src/chess/opening-book";
import { getFenAt, type GameTree, type Path, type TreeNode } from "@/src/chess/tree";

const MAX_POSITION_KEYS = 300;

export function currentHistoryKey(tree: GameTree, path: Path): string {
  return bookKey(getFenAt(tree, path)).toString();
}

export function gameHistoryKeys(tree: GameTree): string[] {
  const keys = new Set([bookKey(tree.startFen).toString()]);
  const variations: TreeNode[] = [];

  function followLine(children: TreeNode[]) {
    while (children.length > 0 && keys.size < MAX_POSITION_KEYS) {
      const main = children[0];
      for (let index = children.length - 1; index > 0; index--) {
        variations.push(children[index]);
      }
      keys.add(bookKey(main.fen).toString());
      children = main.children;
    }
  }

  followLine(tree.children);
  while (variations.length > 0 && keys.size < MAX_POSITION_KEYS) {
    const variation = variations.pop()!;
    keys.add(bookKey(variation.fen).toString());
    followLine(variation.children);
  }
  return [...keys];
}
