import { indexCatalogOpenings as repertoireCatalogIndex } from "../lib/line-opening";
import type { CatalogEntry } from "../lib/openings-catalog";
import { fenKey, getFenAt, type GameTree, type Path, type TreeNode } from "./tree";

export { repertoireCatalogIndex };

export const TRAINING_DEPTHS = [10, 15, 20] as const;
export const OTHER_LINES = "other";

export type Scope = {
  variationFen?: string;
  maxMove?: (typeof TRAINING_DEPTHS)[number];
};

export type RepertoireScopeFilter = (path: Path, parentFen: string) => boolean;

type Variation = { id: string; name: string; eco: string; path: Path };
export function repertoireVariations(
  tree: GameTree,
  catalog: readonly CatalogEntry[],
  selected?: string,
): Variation[] {
  if (tree.children.length === 0) return [];
  const index = repertoireCatalogIndex(catalog);
  const variations = new Map<string, Variation>();
  function walk(fen: string, children: TreeNode[], path: Path, previous: Variation | undefined) {
    const id = fenKey(fen);
    const entry = index.get(id);
    const deepest = entry ? { id, name: entry.name, eco: entry.eco, path } : previous;
    if (deepest && deepest.id === selected) variations.set(deepest.id, deepest);
    if (children.length === 0) {
      const variation = deepest ?? { id: OTHER_LINES, name: "", eco: "", path };
      if (!variations.has(variation.id)) variations.set(variation.id, variation);
    }
    children.forEach((child, i) => walk(child.fen, child.children, [...path, i], deepest));
  }
  walk(tree.startFen, tree.children, [], undefined);
  return [...variations.values()];
}

export function scopeFilter(
  tree: GameTree,
  { variationFen, maxMove }: Scope = {},
  catalogPositions?: ReadonlyMap<string, unknown>,
): RepertoireScopeFilter | undefined {
  if (!variationFen && !maxMove) return undefined;
  let variationPaths: Set<string> | undefined;
  const other = variationFen === OTHER_LINES;
  if (variationFen && (!other || catalogPositions)) {
    const paths = new Set<string>();
    function walk(fen: string, children: TreeNode[], path: Path, matched: boolean): boolean {
      const key = fenKey(fen);
      const seenMatch = matched || (other ? !!catalogPositions?.has(key) : key === variationFen);
      let included = other ? !seenMatch && children.length === 0 : seenMatch;
      children.forEach((child, i) => {
        if (walk(child.fen, child.children, [...path, i], seenMatch)) included = true;
      });
      if (included) paths.add(path.join("."));
      return included;
    }
    // If a named position disappears after a tree edit, use All at the saved depth.
    if (walk(tree.startFen, tree.children, [], false) || other) variationPaths = paths;
  }
  if (!variationPaths && !maxMove) return undefined;
  return (path, parentFen) =>
    (!variationPaths || variationPaths.has(path.join("."))) &&
    (!maxMove || Number(parentFen.split(/\s+/)[5]) <= maxMove);
}

export function scopeIncludesPosition(tree: GameTree, path: Path, filter?: RepertoireScopeFilter) {
  return path.length === 0 || !filter || filter(path, getFenAt(tree, path.slice(0, -1)));
}
