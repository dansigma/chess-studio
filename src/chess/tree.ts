import type { BoardMarks } from "./marks";

export const START_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export type TreeNode = {
  id: string;
  san: string;
  uci: string;
  fen: string;
  from: string;
  to: string;
  comment?: string;
  commentBefore?: string;
  nags?: number[];
  marks?: BoardMarks;
  children: TreeNode[];
};

export type GameTree = {
  startFen: string;
  startComment?: string;
  startMarks?: BoardMarks;
  children: TreeNode[];
};

export type Path = number[];

export function createEmptyTree(startFen = START_FEN): GameTree {
  return { startFen, children: [] };
}

export function newNodeId(): string {
  return crypto.randomUUID();
}

export function getNodeAt(tree: GameTree, path: Path): TreeNode | null {
  let nodes = tree.children;
  let node: TreeNode | null = null;
  for (const index of path) {
    const next = nodes[index];
    if (!next) {
      return null;
    }
    node = next;
    nodes = next.children;
  }
  return node;
}

export function getFenAt(tree: GameTree, path: Path): string {
  return getNodeAt(tree, path)?.fen ?? tree.startFen;
}

export function fenKey(fen: string): string {
  return fen.trim().split(/\s+/).slice(0, 4).join(" ");
}

export type VariationPoint = {
  path: Path;
  fen: string;
  san: string | null;
};

export function pathsEqual(a: Path, b: Path): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export function variationPoints(tree: GameTree, path: Path): VariationPoint[] {
  const points: VariationPoint[] = [{ path: [], fen: tree.startFen, san: null }];
  let nodes = tree.children;
  let current: Path = [];
  for (const index of path) {
    const node = nodes[index];
    if (!node) {
      break;
    }
    current = [...current, index];
    points.push({ path: current, fen: node.fen, san: node.san });
    nodes = node.children;
  }
  while (nodes[0]) {
    current = [...current, 0];
    points.push({ path: current, fen: nodes[0].fen, san: nodes[0].san });
    nodes = nodes[0].children;
  }
  return points;
}

export function mainlinePathForFen(tree: GameTree, targetFen: string): Path {
  const target = fenKey(targetFen);
  if (fenKey(tree.startFen) === target) {
    return [];
  }
  const path: Path = [];
  let nodes = tree.children;
  while (nodes[0]) {
    path.push(0);
    if (fenKey(nodes[0].fen) === target) {
      return path;
    }
    nodes = nodes[0].children;
  }
  return [];
}

export function getLastMove(
  tree: GameTree,
  path: Path,
): { from: string; to: string } | null {
  const node = getNodeAt(tree, path);
  if (!node || !node.from || !node.to) {
    return null;
  }
  return { from: node.from, to: node.to };
}

export function cloneTree(tree: GameTree): GameTree {
  return structuredClone(tree);
}

function childrenAt(tree: GameTree, path: Path): TreeNode[] | null {
  if (path.length === 0) {
    return tree.children;
  }
  return getNodeAt(tree, path)?.children ?? null;
}

export function playMove(
  tree: GameTree,
  path: Path,
  move: Pick<TreeNode, "san" | "uci" | "fen" | "from" | "to">,
): { tree: GameTree; path: Path } {
  const next = cloneTree(tree);
  const siblings = childrenAt(next, path);
  if (!siblings) {
    return { tree, path };
  }
  const existing = siblings.findIndex((child) => child.uci === move.uci);
  if (existing >= 0) {
    return { tree: next, path: [...path, existing] };
  }
  const node: TreeNode = {
    id: newNodeId(),
    san: move.san,
    uci: move.uci,
    fen: move.fen,
    from: move.from,
    to: move.to,
    children: [],
  };
  siblings.push(node);
  return { tree: next, path: [...path, siblings.length - 1] };
}

export function goBack(path: Path): Path {
  return path.slice(0, -1);
}

export function goForward(tree: GameTree, path: Path): Path {
  const children = childrenAt(tree, path);
  if (!children || children.length === 0) {
    return path;
  }
  return [...path, 0];
}

export function goStart(): Path {
  return [];
}

export function goEnd(tree: GameTree, path: Path): Path {
  let current = [...path];
  let children = childrenAt(tree, current);
  while (children && children[0]) {
    current = [...current, 0];
    children = children[0].children;
  }
  return current;
}

export function deleteAfter(tree: GameTree, path: Path): GameTree {
  const next = cloneTree(tree);
  const node = getNodeAt(next, path);
  if (!node) {
    next.children = [];
    return next;
  }
  node.children = [];
  return next;
}

function parentPathOf(path: Path): Path {
  return path.slice(0, -1);
}

export function promoteVariation(
  tree: GameTree,
  path: Path,
): { tree: GameTree; path: Path } {
  const index = path[path.length - 1];
  if (path.length === 0 || index === undefined || index <= 0) {
    return { tree, path };
  }
  const next = cloneTree(tree);
  const siblings = childrenAt(next, parentPathOf(path));
  if (!siblings || !siblings[index] || !siblings[index - 1]) {
    return { tree, path };
  }
  const current = siblings[index];
  siblings[index] = siblings[index - 1];
  siblings[index - 1] = current;
  return { tree: next, path: [...parentPathOf(path), index - 1] };
}

export function makeMainline(
  tree: GameTree,
  path: Path,
): { tree: GameTree; path: Path } {
  if (path.length === 0 || path.every((index) => index === 0)) {
    return { tree, path };
  }
  const next = cloneTree(tree);
  let siblings = next.children;
  for (const index of path) {
    const node = siblings[index];
    if (!node) {
      return { tree, path };
    }
    if (index > 0) {
      siblings.splice(index, 1);
      siblings.unshift(node);
    }
    siblings = node.children;
  }
  return { tree: next, path: path.map(() => 0) };
}

export function deleteVariation(
  tree: GameTree,
  path: Path,
): { tree: GameTree; path: Path } {
  if (path.length === 0) {
    const next = cloneTree(tree);
    next.children = [];
    return { tree: next, path: [] };
  }
  let cut = path.length - 1;
  while (cut > 0 && path[cut] === 0) {
    cut -= 1;
  }
  const parentPath = path.slice(0, cut);
  const index = path[cut];
  if (index === undefined) {
    return { tree, path };
  }
  const next = cloneTree(tree);
  const siblings = childrenAt(next, parentPath);
  if (!siblings || !siblings[index]) {
    return { tree, path };
  }
  siblings.splice(index, 1);
  if (siblings.length === 0) {
    return { tree: next, path: parentPath };
  }
  const nextIndex = Math.min(index, siblings.length - 1);
  return { tree: next, path: [...parentPath, nextIndex] };
}

export function setNodeComment(
  tree: GameTree,
  path: Path,
  comment: string,
): GameTree {
  const next = cloneTree(tree);
  if (path.length === 0) {
    next.startComment = comment.trim() || undefined;
    return next;
  }
  const node = getNodeAt(next, path);
  if (!node) {
    return tree;
  }
  node.comment = comment.trim() || undefined;
  return next;
}

export function setNodeCommentBefore(
  tree: GameTree,
  path: Path,
  comment: string,
): GameTree {
  if (path.length === 0) {
    return tree;
  }
  const next = cloneTree(tree);
  const node = getNodeAt(next, path);
  if (!node) {
    return tree;
  }
  node.commentBefore = comment.trim() || undefined;
  return next;
}

export function setNodeNags(tree: GameTree, path: Path, nags: number[] | undefined): GameTree {
  const next = cloneTree(tree);
  const node = getNodeAt(next, path);
  if (!node) {
    return tree;
  }
  node.nags = nags && nags.length > 0 ? nags : undefined;
  return next;
}

export function getMarksAt(tree: GameTree, path: Path): BoardMarks | undefined {
  if (path.length === 0) {
    return tree.startMarks;
  }
  return getNodeAt(tree, path)?.marks;
}

export function setNodeMarks(
  tree: GameTree,
  path: Path,
  marks: BoardMarks | undefined,
): GameTree {
  const next = cloneTree(tree);
  const value = marks && (marks.squares.length > 0 || marks.arrows.length > 0) ? marks : undefined;
  if (path.length === 0) {
    next.startMarks = value;
    return next;
  }
  const node = getNodeAt(next, path);
  if (!node) {
    return tree;
  }
  node.marks = value;
  return next;
}

export function canPromote(path: Path): boolean {
  const index = path[path.length - 1];
  return path.length > 0 && index !== undefined && index > 0;
}

export function canMakeMainline(path: Path): boolean {
  return path.length > 0 && path.some((index) => index > 0);
}

export function goForwardN(tree: GameTree, path: Path, steps = 10): Path {
  let current = path;
  for (let i = 0; i < steps; i += 1) {
    const next = goForward(tree, current);
    if (pathsEqual(next, current)) {
      break;
    }
    current = next;
  }
  return current;
}

export function isPrefix(prefix: Path, path: Path): boolean {
  return prefix.every((value, index) => path[index] === value);
}

export type NotationPly = {
  path: Path;
  san: string;
  moveNumber: number;
  color: "w" | "b";
  isVariation: boolean;
};

export function flattenMainLine(tree: GameTree): TreeNode[] {
  const line: TreeNode[] = [];
  let children = tree.children;
  while (children[0]) {
    line.push(children[0]);
    children = children[0].children;
  }
  return line;
}

export function plyColor(startFen: string, pathLength: number): "w" | "b" {
  const side = startFen.split(" ")[1] === "b" ? "b" : "w";
  if (pathLength % 2 === 1) {
    return side;
  }
  return side === "w" ? "b" : "w";
}

export function moveNumberForPath(startFen: string, pathLength: number): number {
  const fullmove = Number(startFen.split(" ")[5] ?? "1") || 1;
  const side = startFen.split(" ")[1] === "b" ? 1 : 0;
  return fullmove + Math.floor((side + pathLength - 1) / 2);
}
