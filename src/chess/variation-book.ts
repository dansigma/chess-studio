import { Chess } from "chess.js";
import { bookKey } from "./opening-book.ts";
import type { CountsBook } from "./opening-book-counts-format.ts";
import { createEmptyTree, newNodeId, type GameTree, type TreeNode } from "./tree.ts";

export const VARIATION_LEVELS = {
  beginner: { lastMove: 10, coverage: 0.7, minReplyShare: 0.1, reachCutoff: 0.05, maxReplies: 2 },
  intermediate: { lastMove: 15, coverage: 0.85, minReplyShare: 0.05, reachCutoff: 0.02, maxReplies: Infinity },
  advanced: { lastMove: 20, coverage: 0.95, minReplyShare: 0.02, reachCutoff: 0.005, maxReplies: Infinity },
} as const;

const MAX_USER_MOVES = 600;

export type VariationBookOptions = {
  startUci: readonly string[];
  color: "white" | "black";
  level: keyof typeof VARIATION_LEVELS;
};

export type VariationBookResult = {
  tree: GameTree;
  lines: number;
  userMoves: number;
  capped: boolean;
};

export function buildVariationBook(
  counts: CountsBook,
  { startUci, color, level }: VariationBookOptions,
): VariationBookResult {
  const tree = createEmptyTree();
  const chess = new Chess(tree.startFen);
  const userColor = color === "white" ? "w" : "b";
  const rules = VARIATION_LEVELS[level];
  const maxPly = Math.min(rules.lastMove * 2, counts.maxPly);
  // Allow for rounding in the product when a reply lands exactly on the cutoff.
  const reachCutoff = rules.reachCutoff * (1 - maxPly * Number.EPSILON);

  function appendMove(children: TreeNode[], uci: string): TreeNode {
    const { san, after, from, to, lan } = chess.move({
      from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4],
    });
    const node: TreeNode = { id: newNodeId(), san, uci: lan, fen: after, from, to, children: [] };
    children.push(node);
    return node;
  }

  let prefixUserMoves = 0;
  let tip = tree.children;
  for (const uci of startUci) {
    if (chess.turn() === userColor) prefixUserMoves += 1;
    tip = appendMove(tip, uci).children;
  }
  if (prefixUserMoves > MAX_USER_MOVES) {
    throw new RangeError("The start line exceeds the variation book's user move limit");
  }

  type Branch = { node: TreeNode; siblings: TreeNode[] };
  const userMoves: { reach: number; branch: Branch }[] = [];
  function expand(children: TreeNode[], ply: number, reach: number, incomingReply?: Branch) {
    if (ply >= maxPly) return;
    const position = counts.positionFor(bookKey(chess.fen()));
    if (!position?.moves.length) return;

    if (chess.turn() === userColor) {
      const node = appendMove(children, position.moves[0].uci);
      userMoves.push({ reach, branch: incomingReply ?? { node, siblings: children } });
      expand(node.children, ply + 1, reach);
      chess.undo();
      return;
    }

    let coveredGames = 0;
    for (const { uci, games } of position.moves) {
      if (children.length >= rules.maxReplies || coveredGames / position.total >= rules.coverage) break;
      const share = games / position.total;
      const childReach = reach * share;
      if (share < rules.minReplyShare || childReach < reachCutoff) break;
      coveredGames += games;
      const node = appendMove(children, uci);
      expand(node.children, ply + 1, childReach, { node, siblings: children });
      chess.undo();
    }
  }
  expand(tip, startUci.length, 1);

  const budget = MAX_USER_MOVES - prefixUserMoves;
  const capped = userMoves.length > budget;
  if (capped) {
    // Reach never increases down a line. Stable sorting keeps ancestors ahead
    // of their descendants at equal reach, so removing a branch cannot cut a kept move.
    userMoves.sort((a, b) => b.reach - a.reach);
    for (const { branch: { node, siblings } } of userMoves.slice(budget)) {
      siblings.splice(siblings.indexOf(node), 1);
    }
  }

  function countLines(children: TreeNode[]): number {
    if (children.length === 0) return 1;
    return children.reduce((sum, node) => sum + countLines(node.children), 0);
  }

  return { tree, lines: countLines(tip), userMoves: prefixUserMoves + Math.min(userMoves.length, budget), capped };
}
