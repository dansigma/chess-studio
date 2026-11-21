import { Chess } from "chess.js";
import { cloneTree, fenKey, newNodeId, type GameTree, type TreeNode } from "./tree";

export type VariationMergeConflict = {
  fen: string;
  moveNumber: number;
  mineUci: string;
  mineSan: string;
  bookUci: string;
  bookSan: string;
};

export type VariationMergeDecisions = Readonly<Record<string, "mine" | "book">>;

type Position = { fen: string; children: TreeNode[] };

function merge(
  repertoire: GameTree,
  book: GameTree,
  color: "white" | "black",
  decisions?: VariationMergeDecisions,
  offeredMoves?: ReadonlyMap<string, string>,
) {
  const tree = cloneTree(repertoire);
  const root = { fen: tree.startFen, children: tree.children };
  const positions = new Map<string, Position[]>();
  const originalMoves = new Map<string, TreeNode[]>();
  const conflicts = new Map<string, VariationMergeConflict>();
  const kept = new Set<string>();
  const added = new Set<TreeNode>();
  const newLines = new Set<TreeNode>();
  const userSide = color === "white" ? "w" : "b";

  function index(position: Position) {
    const key = fenKey(position.fen);
    const matches = positions.get(key) ?? [];
    matches.push(position);
    positions.set(key, matches);
  }

  function indexRepertoire(position: Position) {
    index(position);
    const key = fenKey(position.fen);
    const moves = originalMoves.get(key) ?? [];
    originalMoves.set(key, moves.concat(position.children));
    position.children.forEach(indexRepertoire);
  }

  function visit(fen: string, moves: TreeNode[], local?: Position, lastAdded?: TreeNode) {
    if (moves.length === 0 && lastAdded) newLines.add(lastAdded);
    const key = fenKey(fen);
    const matches = positions.get(key) ?? [];
    const existing = originalMoves.get(key) ?? [];
    const [, turn, , , , moveNumber] = fen.split(" ");
    for (const move of moves) {
      const mine = existing[0];
      const conflict = turn === userSide && mine && !existing.some((node) => node.uci === move.uci);
      if (conflict && decisions) {
        if (decisions[key] !== "book") {
          kept.add(key);
          continue;
        }
        if (offeredMoves?.get(key) !== move.uci) continue;
      } else if (conflict) {
        const previous = conflicts.get(key);
        // A repeated position shares one decision for the book move shown.
        if (previous && previous.bookUci !== move.uci) continue;
        conflicts.set(key, previous ?? {
          fen, moveNumber: Number(moveNumber), mineUci: mine.uci, mineSan: mine.san,
          bookUci: move.uci, bookSan: move.san,
        });
      }

      const hasMove = (position: Position) => position.children.some((child) => child.uci === move.uci);
      const target = (local && hasMove(local) ? local : matches.find(hasMove))
        ?? (conflict ? matches.find((position) => position.children.includes(mine)) : undefined)
        ?? (local?.children.length ? local : matches.find((position) => position.children.length > 0))
        ?? matches[0];
      if (!target) {
        // A repertoire starting from a setup position can still accept the
        // suffix once the book reaches a position present on that board.
        visit(move.fen, move.children);
        continue;
      }

      let node = target.children.find((child) => child.uci === move.uci);
      if (!node) {
        // A transposition can have different move numbers and halfmove clocks.
        const chess = new Chess(target.fen);
        const { after, san, from, to } = chess.move({
          from: move.from, to: move.to, promotion: move.uci[4],
        });
        node = { id: decisions ? newNodeId() : move.id, san, fen: after, from, to, uci: move.uci, children: [] };
        if (conflict) target.children.unshift(node);
        else target.children.push(node);
        added.add(node);
        index(node);
      }
      visit(move.fen, move.children, node, added.has(node) ? node : lastAdded);
    }
  }

  indexRepertoire(root);
  visit(book.startFen, book.children, fenKey(book.startFen) === fenKey(root.fen) ? root : undefined);
  return {
    tree: added.size ? tree : repertoire,
    addedLines: newLines.size,
    keptConflicts: kept.size,
    conflicts: [...conflicts.values()],
  };
}

/** Count new lines assuming every suggested move is accepted. */
export function planMerge(repertoire: GameTree, book: GameTree, color: "white" | "black") {
  const { conflicts, addedLines } = merge(repertoire, book, color);
  return { conflicts, newLines: addedLines };
}

export function applyMerge(
  repertoire: GameTree,
  book: GameTree,
  color: "white" | "black",
  decisions: VariationMergeDecisions,
) {
  // An upstream "keep mine" can make the first occurrence of a repeated
  // conflict unreachable. Only accept the exact move offered in the plan.
  const offeredMoves = Object.values(decisions).includes("book")
    ? new Map(planMerge(repertoire, book, color).conflicts.map(({ fen, bookUci }) => [fenKey(fen), bookUci]))
    : undefined;
  const { tree, addedLines, keptConflicts } = merge(repertoire, book, color, decisions, offeredMoves);
  return { tree, addedLines, keptConflicts };
}
